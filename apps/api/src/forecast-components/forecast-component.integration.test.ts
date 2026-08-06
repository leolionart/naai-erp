import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
(enabled ? describe : describe.skip)("ERP-610 forecast composition PostgreSQL API", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
    org = "org-erp610";
  let app: Awaited<ReturnType<typeof createApp>>;
  const post = (
    path: string,
    payload: Record<string, unknown>,
    token = "maker610-token",
    key = randomKey(),
  ) =>
    app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}${path}`,
      headers: { authorization: `Bearer ${token}`, "idempotency-key": key },
      payload,
    });
  const component = (
    id: string,
    section: string,
    kind: string,
    amountMinor: string,
    direction: "increase" | "decrease",
    source: Record<string, unknown>,
    scheduledOn = "2026-08-15",
    probabilityBps = 10000,
  ) => ({
    schemaVersion: 1,
    id,
    section,
    kind,
    direction,
    scheduledOn,
    amountMinor,
    probabilityBps,
    currency: "VND",
    source,
    reason: `Create ${id}`,
  });
  beforeAll(async () => {
    await pool.query(
      `insert into organizations(id,legal_name,base_currency,timezone) values($1,'ERP610','VND','Asia/Ho_Chi_Minh')`,
      [org],
    );
    await pool.query(
      `insert into users(id,email,display_name) values('maker610','maker610@example.com','Maker'),('checker610','checker610@example.com','Checker')`,
    );
    await pool.query(
      `insert into organization_memberships(organization_id,user_id) values($1,'maker610'),($1,'checker610')`,
      [org],
    );
    await pool.query(
      `insert into membership_roles(organization_id,user_id,role) values($1,'maker610','finance_admin'),($1,'checker610','approver')`,
      [org],
    );
    for (const [id, actor, token, roles] of [
      ["m610", "maker610", "maker610-token", '["finance_admin"]'],
      ["c610", "checker610", "checker610-token", '["approver"]'],
    ] as const)
      await pool.query(
        `insert into api_credentials(organization_id,id,actor_id,token_hash,roles) values($1,$2,$3,$4,$5)`,
        [org, id, actor, createHash("sha256").update(token).digest("hex"), roles],
      );
    await pool.query(
      `insert into forecast_versions(organization_id,id,version_number,scenario,snapshot_kind,as_of_date,starts_on,ends_on,actual_basis,currency,reason,created_by) values($1,'forecast-610',1,'base','month_end','2026-08-01','2026-08-01','2026-08-31','recognized','VND','ERP610','maker610')`,
      [org],
    );
    await pool.query(
      `insert into parties(organization_id,id,display_name) values($1,'client-610','Client 610')`,
      [org],
    );
    await pool.query(
      `insert into projects(organization_id,id,code,name,client_party_id,owner_user_id,contract_type,currency,budget_minor,starts_on,state) values($1,'project-610','P610','Project 610','client-610','maker610','fixed_fee','VND',100000000,'2026-08-01','active')`,
      [org],
    );
    await pool.query(
      `insert into revenue_recognition_policies(organization_id,id,project_id,version_number,method,effective_from,currency,contract_value_minor,revenue_account_code,contract_asset_account_code,contract_liability_account_code,evidence_required,state,created_by) values($1,'policy-610','project-610',1,'milestone','2026-08-01','VND',100000000,'511','131','3387',false,'approved','maker610')`,
      [org],
    );
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
    await pool.end();
  });
  it("T-FCT-003 composes revenue and expense without source double-counting", async () => {
    const inputs = [
      component(
        "opening",
        "cash",
        "opening_cash",
        "100000000",
        "increase",
        { type: "bank_balance", id: "bank-main" },
        "2026-08-01",
      ),
      component("milestone", "revenue", "committed_milestone", "50000000", "increase", {
        type: "milestone",
        id: "m1",
        commercialRootType: "contract",
        commercialRootId: "c1",
      }),
      component(
        "pipeline",
        "revenue",
        "weighted_pipeline",
        "50000000",
        "increase",
        {
          type: "opportunity",
          id: "o1",
          commercialRootType: "opportunity",
          commercialRootId: "o1",
        },
        "2026-08-20",
        8000,
      ),
      component("expense-payroll", "expense", "payroll", "44000000", "increase", {
        type: "payroll_schedule",
        id: "payroll-aug",
      }),
      component("cash-collection", "cash", "expected_collection", "30000000", "increase", {
        type: "receivable",
        id: "ar-1",
      }),
      component("cash-payroll", "cash", "payroll", "44000000", "decrease", {
        type: "payroll_schedule",
        id: "payroll-aug",
      }),
      component("cash-ap", "cash", "ap_due", "20000000", "decrease", {
        type: "payable",
        id: "ap-1",
      }),
      component("cash-opex", "cash", "recurring_expense", "20000000", "decrease", {
        type: "recurring_schedule",
        id: "opex-aug",
      }),
      component("cash-tax", "cash", "tax", "10000000", "decrease", {
        type: "tax_schedule",
        id: "tax-aug",
      }),
      component("cash-capex", "cash", "capex", "14000000", "decrease", {
        type: "capex_schedule",
        id: "capex-aug",
      }),
    ];
    for (const input of inputs) {
      const response = await post("/forecast-versions/forecast-610/components", input);
      expect(response.statusCode, response.body).toBe(201);
    }
    const replay = await post(
      "/forecast-versions/forecast-610/components",
      inputs[1]!,
      "maker610-token",
      "replay-source",
    );
    expect(replay.statusCode).toBe(409);
    const result = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${org}/forecast-versions/forecast-610/composition`,
      headers: { authorization: "Bearer maker610-token" },
    });
    expect(result.statusCode, result.body).toBe(200);
    expect(result.json().data).toMatchObject({
      formulaVersion: "forecast-composition-v1",
      actualBasis: "recognized",
      projectedRevenueMinor: "90000000",
      projectedExpenseMinor: "44000000",
      projectedClosingCashMinor: "22000000",
    });
  });
  it("T-FCT-004 applies maker-checker review and makes published parents immutable", async () => {
    const created = await post(
      "/forecast-versions/forecast-610/components",
      component("manual-revenue", "revenue", "manual_adjustment", "1000000", "increase", {
        type: "manual",
        id: "manual-1",
      }),
    );
    expect(created.statusCode, created.body).toBe(201);
    const self = await post(
      "/forecast-versions/forecast-610/components/manual-revenue/review",
      { schemaVersion: 1, expectedResourceVersion: "1", reason: "Self" },
      "maker610-token",
    );
    expect(self.statusCode).toBe(409);
    const reviewed = await post(
      "/forecast-versions/forecast-610/components/manual-revenue/review",
      { schemaVersion: 1, expectedResourceVersion: "1", reason: "Checked" },
      "checker610-token",
    );
    expect(reviewed.statusCode, reviewed.body).toBe(201);
    expect(reviewed.json().data.resource).toMatchObject({
      reviewState: "reviewed",
      weightedAmountMinor: "1000000",
    });
    const crossOperationPayload = {
      schemaVersion: 1,
      expectedResourceVersion: "2",
      reason: "Exclude reviewed adjustment",
    };
    const excluded = await post(
      "/forecast-versions/forecast-610/components/manual-revenue/exclude",
      crossOperationPayload,
      "maker610-token",
      "cross-operation-key",
    );
    expect(excluded.statusCode, excluded.body).toBe(201);
    const wrongReplay = await post(
      "/forecast-versions/forecast-610/components/manual-revenue/review",
      crossOperationPayload,
      "checker610-token",
      "cross-operation-key",
    );
    expect(wrongReplay.statusCode).toBe(409);
    const published = await post(
      "/forecast-versions/forecast-610/publish",
      { schemaVersion: 1, expectedResourceVersion: "1", reason: "Publish" },
      "checker610-token",
    );
    expect(published.statusCode, published.body).toBe(201);
    const immutable = await post(
      "/forecast-versions/forecast-610/components",
      component("late", "cash", "financing", "1", "increase", { type: "financing", id: "late" }),
    );
    expect(immutable.statusCode).toBe(409);
    const persisted = (
      await pool.query(
        `select composition_snapshot from forecast_versions where organization_id=$1 and id='forecast-610'`,
        [org],
      )
    ).rows[0]?.composition_snapshot;
    expect(persisted).toMatchObject({ projectedRevenueMinor: "90000000" });
    await pool.query(
      `insert into revenue_recognition_events(organization_id,id,project_id,policy_id,policy_version_number,effective_on,amount_minor,currency,policy_snapshot,state,posted_by,posted_at,reason,created_by) values($1,'late-recognition','project-610','policy-610',1,'2026-08-01',99999999,'VND','{}','posted','checker610',now(),'Late backdated actual','maker610')`,
      [org],
    );
    const stable = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${org}/forecast-versions/forecast-610/composition`,
      headers: { authorization: "Bearer maker610-token" },
    });
    expect(stable.statusCode, stable.body).toBe(200);
    expect(stable.json().data).toEqual(persisted);
  });
});
let sequence = 0;
const randomKey = () => `erp610-${++sequence}`;
