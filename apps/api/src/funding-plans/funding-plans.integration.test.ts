import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-978 bulk funding plans", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const org = `org-fp-${randomUUID()}`;
  const ownerToken = `fp-owner-${org}`;
  let app: Awaited<ReturnType<typeof createApp>>;

  const headers = (key?: string) => ({
    authorization: `Bearer ${ownerToken}`,
    ...(key ? { "idempotency-key": key } : {}),
  });

  beforeAll(async () => {
    await pool.query(
      `insert into organizations(id,legal_name,base_currency,timezone) values($1,'Funding Plans Org','VND','Asia/Ho_Chi_Minh')`,
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
         ($1,'111-CASH','Tien mat','asset'),
         ($1,'3388-OWNER','Phai tra chu','liability'),
         ($1,'642-OPEX','Chi phi QLDN','expense')`,
      [org],
    );
    await pool.query(
      `insert into financial_accounts(organization_id,id,code,kind,display_name,currency,ledger_account_code,status,created_by,updated_by) values
         ($1,'cash-owner-custody','CASH-OWNER-CUSTODY','cash','Quy chu giu ho','VND','111-CASH','active','owner-1','owner-1')`,
      [org],
    );
    await pool.query(
      `insert into parties(organization_id,id,display_name,status) values($1,'SUP-1','NCC 1','active')`,
      [org],
    );
    await pool.query(
      `insert into party_roles(organization_id,party_id,role) values($1,'SUP-1','supplier')`,
      [org],
    );
    await pool.query(
      `insert into financial_statement_mapping_versions(organization_id,id,version,framework,state,effective_from,change_reason,created_by,approved_by,approved_at) values
         ($1,'map-bs',1,'TT133','approved','2026-01-01','Owner current mapping','owner-1','owner-1',now())`,
      [org],
    );
    await pool.query(
      `insert into financial_statement_mapping_lines(organization_id,mapping_id,mapping_version,line_number,statement,line_code,label,account_code,display_order,sign) values
         ($1,'map-bs',1,1,'balance_sheet','owner_current','Owner Current','3388-OWNER',10,1)`,
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

  it("exports, dry-runs with blocked items, rejects stale planHash, and commits bulk funding changes", async () => {
    const createExp = (id: string, date: string) =>
      app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/expenses`,
        headers: headers(`fp-create-${id}`),
        payload: {
          id,
          expenseClass: "invoice_backed",
          payeePartyId: "SUP-1",
          expenseDate: date,
          businessPurpose: `Chi phí ${id}`,
          currency: "VND",
          netMinor: "50000",
          vatMinor: "0",
          grossMinor: "50000",
          counterAccountCode: "3388-OWNER",
          evidenceChecklist: { invoice: true },
          externalReference: { system: "n8n", externalId: `ext-${id}` },
          lines: [
            {
              description: `Chi phí ${id}`,
              netMinor: "50000",
              vatMinor: "0",
              grossMinor: "50000",
              postingAccountCode: "642-OPEX",
              allocations: [
                { id: `${id}-a`, amountMinor: "50000", dimensions: { costCenter: "ADMIN" } },
              ],
            },
          ],
        },
      });
    expect((await createExp("exp-fp-1", "2026-08-10")).statusCode).toBe(201);

    const exported = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${org}/funding-plans/export?from=2026-08-01&to=2026-08-31&format=csv`,
      headers: headers(),
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.json().data.csv).toContain("exp-fp-1");

    const dryRun = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/funding-plans/dry-run`,
      headers: headers(),
      payload: {
        items: [
          { kind: "expense", id: "exp-fp-1", targetFunding: "owner_custody_cash" },
          { kind: "expense", id: "missing-exp", targetFunding: "owner_custody_cash" },
        ],
      },
    });
    expect(dryRun.statusCode, dryRun.body).toBe(201);
    const { planHash, summary } = dryRun.json().data;
    expect(summary.readyCount).toBe(1);
    expect(summary.blockedCount).toBe(1);
    expect(summary.dashboardImpact.ownerDebtDeltaMinor).toBe("-50000");
    expect(summary.dashboardImpact.ownerCustodyDeltaMinor).toBe("-50000");

    const badCommit = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/funding-plans/commit`,
      headers: headers("fp-commit-bad"),
      payload: {
        planHash: "wrong-hash",
        items: [{ kind: "expense", id: "exp-fp-1", targetFunding: "owner_custody_cash" }],
      },
    });
    expect(badCommit.statusCode).toBe(409);

    const committed = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/funding-plans/commit`,
      headers: headers("fp-commit-ok"),
      payload: {
        planHash,
        postReplacement: true,
        reason: "Chuyển sang quỹ chủ giữ hộ hàng loạt",
        items: [
          { kind: "expense", id: "exp-fp-1", targetFunding: "owner_custody_cash" },
          { kind: "expense", id: "missing-exp", targetFunding: "owner_custody_cash" },
        ],
      },
    });
    expect(committed.statusCode, committed.body).toBe(201);
    expect(committed.json().data.summary, committed.body).toEqual({
      total: 2,
      succeeded: 1,
      blocked: 1,
      failed: 0,
    });
  });
});
