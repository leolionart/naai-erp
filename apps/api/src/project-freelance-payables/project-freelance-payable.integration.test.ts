import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";
const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const suite = enabled ? describe : describe.skip;
suite("ERP-890 project freelance payable API", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const org = `org-erp890-${randomUUID().slice(0, 8)}`,
    token = `erp890-${randomUUID()}`;
  let app: Awaited<ReturnType<typeof createApp>>;
  const headers = (key: string) => ({
    authorization: `Bearer ${token}`,
    "x-correlation-id": `corr-${key}`,
    "idempotency-key": key,
  });
  beforeAll(async () => {
    await pool.query(`insert into users(id,email,display_name) values($1,$2,'Owner')`, [
      `${org}-owner`,
      `${org}@example.test`,
    ]);
    const seed = `insert into organizations(id,legal_name,base_currency,timezone) values($1,'ERP 890','VND','Asia/Ho_Chi_Minh');insert into fiscal_years(organization_id,year,starts_on,ends_on) values($1,2026,'2026-01-01','2026-12-31');insert into fiscal_periods(organization_id,fiscal_year,period_number,starts_on,ends_on,state) values($1,2026,8,'2026-08-01','2026-08-31','open');insert into accounts(organization_id,code,name,root_type,is_control_account,allow_manual_posting) values($1,'112','Bank','asset',false,true),($1,'331','AP','liability',true,false),($1,'642','Freelance cost','expense',false,true);insert into parties(organization_id,id,display_name,status) values($1,'freelancer','Freelancer','active');insert into party_roles(organization_id,party_id,role) values($1,'freelancer','freelancer');insert into projects(organization_id,id,code,name,state,client_party_id,contract_type,currency,start_date,owner_id,created_by,updated_by) values($1,'project','P','Project','active','freelancer','fixed_price','VND','2026-01-01','owner','owner','owner');insert into financial_accounts(organization_id,id,code,kind,display_name,currency,ledger_account_code,bank_code,created_by,updated_by) values($1,'bank','BANK','bank','Bank','VND','112','BANK','owner','owner');insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by) values($1,'expense-journal','2026-08-01','Freelance expense','VND','posted',1,'owner',now(),'owner','Approved',now(),'owner');insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions) values($1,'expense-journal',1,'642',100,null,'Cost','{"projectId":"project"}'),($1,'expense-journal',2,'331',null,100,'AP','{"partyId":"freelancer"}');insert into expenses(organization_id,id,expense_class,state,payee_party_id,expense_date,freelance_due_date,business_purpose,currency,net_minor,vat_minor,gross_minor,counter_account_code,cit_state,vat_state,evidence_checklist,journal_id,version,created_by,approved_by,approved_at,posted_by,posted_at) values($1,'expense','freelancer','posted','freelancer','2026-08-01','2026-08-20','Freelance work','VND',100,0,100,'331','eligible','ineligible','{}','expense-journal',1,'owner','owner',now(),'owner',now());insert into project_freelance_payables(organization_id,id,expense_id,project_id,freelancer_party_id,due_date,amount_minor,currency,journal_id,created_by) values($1,'payable','expense','project','freelancer','2026-08-20',100,'VND','expense-journal','owner')`;
    const normalizedSeed = seed.replace(
      "insert into projects(organization_id,id,code,name,state,client_party_id,contract_type,currency,start_date,owner_id,created_by,updated_by) values($1,'project','P','Project','active','freelancer','fixed_price','VND','2026-01-01','owner','owner','owner')",
      `insert into organization_memberships(organization_id,user_id) values($1,'${org}-owner');insert into projects(organization_id,id,code,name,client_party_id,owner_user_id,contract_type,currency,budget_minor,starts_on,state) values($1,'project','P','Project','freelancer','${org}-owner','fixed_fee','VND',0,'2026-01-01','active')`,
    );
    await pool.query(normalizedSeed.replaceAll("$1", `'${org}'`));
    await pool.query(
      `insert into api_credentials(organization_id,id,actor_id,token_hash,roles) values($1,'credential','owner',$2,'["owner"]')`,
      [org, createHash("sha256").update(token).digest("hex")],
    );
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
    await pool.end();
  });
  it("lists only actual freelance payable and records partial/full payment idempotently", async () => {
    const list = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${org}/project-freelance-payables`,
      headers: headers("list"),
    });
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json().data[0]).toMatchObject({
      expenseId: "expense",
      outstandingMinor: "100",
      state: "unpaid",
    });
    const request = {
      method: "POST" as const,
      url: `/api/v1/organizations/${org}/project-freelance-payables/payable/pay`,
      headers: headers("pay-1"),
      payload: {
        schemaVersion: 1,
        financialAccountId: "bank",
        paymentDate: "2026-08-11",
        amountMinor: "40",
        reason: "Paid",
      },
    };
    const partial = await app.inject(request);
    expect(partial.statusCode, partial.body).toBe(201);
    expect(partial.json().data).toMatchObject({ state: "partially_paid", outstandingMinor: "60" });
    const aging = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${org}/reports/ap-aging?asOf=2026-08-15&includeSettled=false`,
      headers: headers("aging"),
    });
    expect(aging.statusCode, aging.body).toBe(200);
    expect(aging.json().data.items).toEqual([
      expect.objectContaining({
        outstandingMinor: "60",
        drilldown: expect.objectContaining({
          sourceType: "project_freelance_payable",
          sourceId: "payable",
        }),
      }),
    ]);
    expect((await app.inject(request)).json().data.idempotencyReplayed).toBe(true);
    const full = await app.inject({
      method: "POST",
      url: request.url,
      headers: headers("pay-2"),
      payload: { ...request.payload, amountMinor: "60" },
    });
    expect(full.statusCode, full.body).toBe(201);
    expect(full.json().data).toMatchObject({ state: "paid", outstandingMinor: "0" });
    const balance = await pool.query(
      `select sum(coalesce(debit_minor,0)-coalesce(credit_minor,0))::text n from journal_lines where organization_id=$1 and journal_id in(select journal_id from project_freelance_payable_payments where organization_id=$1)`,
      [org],
    );
    expect(balance.rows[0].n).toBe("0");
  });
});
