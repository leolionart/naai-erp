import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-979 account reclassification & account plans", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const org = `org-ap-${randomUUID()}`;
  const ownerToken = `ap-owner-${org}`;
  let app: Awaited<ReturnType<typeof createApp>>;

  const headers = (key?: string, ifMatch?: string) => ({
    authorization: `Bearer ${ownerToken}`,
    ...(key ? { "idempotency-key": key } : {}),
    ...(ifMatch ? { "if-match": ifMatch } : {}),
  });

  beforeAll(async () => {
    await pool.query(
      `insert into organizations(id,legal_name,base_currency,timezone) values($1,'Account Plans Org','VND','Asia/Ho_Chi_Minh')`,
      [org],
    );
    await pool.query(
      `insert into accounting_workflow_policies(organization_id,allow_self_approval,self_approval_max_minor,operating_mode,updated_by)
       values($1,false,null,'solopreneur','owner-1')`,
      [org],
    );
    await pool.query(
      `insert into fiscal_years(organization_id,year,starts_on,ends_on) values($1,2026,'2026-01-01','2026-12-31')`,
      [org],
    );
    await pool.query(
      `insert into fiscal_periods(organization_id,fiscal_year,period_number,starts_on,ends_on) values
         ($1,2026,8,'2026-08-01','2026-08-31')`,
      [org],
    );
    await pool.query(
      `insert into accounts(organization_id,code,name,root_type) values
         ($1,'131-AR','Phai thu KH','asset'),
         ($1,'3388-OWNER','Phai tra chu','liability'),
         ($1,'5111','Doanh thu ban hang','revenue'),
         ($1,'5113','Doanh thu dich vu','revenue'),
         ($1,'642-OPEX','Chi phi QLDN','expense'),
         ($1,'641-SELL','Chi phi ban hang','expense')`,
      [org],
    );
    await pool.query(
      `insert into parties(organization_id,id,display_name,status) values
         ($1,'SUP-1','NCC 1','active'),
         ($1,'CLI-1','KH 1','active')`,
      [org],
    );
    await pool.query(
      `insert into party_roles(organization_id,party_id,role) values
         ($1,'SUP-1','supplier'),($1,'CLI-1','client')`,
      [org],
    );
    await pool.query(
      `insert into users(id,email,display_name) values('owner-1','owner-1@example.com','Owner 1') on conflict(id) do nothing`,
    );
    await pool.query(
      `insert into organization_memberships(organization_id,user_id) values($1,'owner-1')`,
      [org],
    );
    await pool.query(
      `insert into projects(organization_id,id,code,name,client_party_id,owner_user_id,contract_type,currency,budget_minor,starts_on,state)
       values($1,'PRJ-AP','PRJ-AP','AP Project','CLI-1','owner-1','fixed_fee','VND',1000000,'2026-01-01','active')`,
      [org],
    );
    await pool.query(
      `insert into contracts(organization_id,id,project_id,reference,signed_on,value_minor,currency)
       values($1,'CONTRACT-AP','PRJ-AP','CONTRACT-AP','2026-01-01',1000000,'VND')`,
      [org],
    );
    const ownerHash = createHash("sha256").update(ownerToken).digest("hex");
    await pool.query(
      `insert into api_credentials(organization_id,id,actor_id,token_hash,roles) values($1,'cred-owner','owner-1',$2,'["owner"]')`,
      [org, ownerHash],
    );
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  it("reclassifies expense and sales invoice accounts via single command and bulk account-plans", async () => {
    const expRes = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/expenses`,
      headers: headers("ap-exp-1"),
      payload: {
        id: "exp-ap-1",
        expenseClass: "invoice_backed",
        payeePartyId: "SUP-1",
        expenseDate: "2026-08-12",
        businessPurpose: "Chi phí quảng cáo",
        currency: "VND",
        netMinor: "100000",
        vatMinor: "0",
        grossMinor: "100000",
        counterAccountCode: "3388-OWNER",
        evidenceChecklist: { invoice: true },
        externalReference: { system: "n8n", externalId: "ap-ext-1" },
        lines: [
          {
            description: "Quảng cáo",
            netMinor: "100000",
            vatMinor: "0",
            grossMinor: "100000",
            postingAccountCode: "642-OPEX",
            allocations: [
              { id: "ap-a1", amountMinor: "100000", dimensions: { costCenter: "ADMIN" } },
            ],
          },
        ],
      },
    });
    expect(expRes.statusCode, expRes.body).toBe(201);

    const salesRes = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/commercial-documents`,
      headers: headers("ap-si-1"),
      payload: {
        id: "si-ap-1",
        type: "sales_invoice",
        documentNumber: "SI-AP-1",
        series: "1C26TYY",
        fiscalYear: 2026,
        partyId: "CLI-1",
        documentDate: "2026-08-12",
        dueDate: "2026-08-12",
        currency: "VND",
        netMinor: "200000",
        taxMinor: "0",
        grossMinor: "200000",
        controlAccountCode: "131-AR",
        lines: [
          {
            description: "Dịch vụ phần mềm",
            quantity: "1",
            unitPriceMinor: "200000",
            netMinor: "200000",
            taxMinor: "0",
            grossMinor: "200000",
            primaryAccountCode: "5111",
            allocations: [
              { id: "ap-sa1", amountMinor: "200000", dimensions: { projectId: "PRJ-AP" } },
            ],
          },
        ],
      },
    });
    expect(salesRes.statusCode, salesRes.body).toBe(201);

    // Dry-run bulk account plan (including an invalid root_type account blocked row)
    const dryRun = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/account-plans/dry-run`,
      headers: headers(),
      payload: {
        items: [
          { kind: "expense", id: "exp-ap-1", lines: [{ lineNumber: 1, accountCode: "641-SELL" }] },
          { kind: "sales_invoice", id: "si-ap-1", lines: [{ lineNumber: 1, accountCode: "5113" }] },
          { kind: "expense", id: "exp-ap-1", lines: [{ lineNumber: 1, accountCode: "5113" }] },
        ],
      },
    });
    expect(dryRun.statusCode, dryRun.body).toBe(201);
    const { planHash, summary } = dryRun.json().data;
    expect(summary).toEqual({ total: 3, readyCount: 2, blockedCount: 1 });

    const commit = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/account-plans/commit`,
      headers: headers("ap-commit-1"),
      payload: {
        planHash,
        postReplacement: true,
        reason: "Chuyển đúng tài khoản chi phí và doanh thu",
        items: [
          { kind: "expense", id: "exp-ap-1", lines: [{ lineNumber: 1, accountCode: "641-SELL" }] },
          { kind: "sales_invoice", id: "si-ap-1", lines: [{ lineNumber: 1, accountCode: "5113" }] },
          { kind: "expense", id: "exp-ap-1", lines: [{ lineNumber: 1, accountCode: "5113" }] },
        ],
      },
    });
    expect(commit.statusCode, commit.body).toBe(201);
    expect(commit.json().data.summary).toEqual({
      total: 3,
      succeeded: 2,
      blocked: 1,
      failed: 0,
    });
  });
});
