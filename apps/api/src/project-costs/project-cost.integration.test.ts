import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";
const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL,
  suite = enabled ? describe : describe.skip;
suite("ERP-510 project cost PostgreSQL API", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
    token = "erp510-token";
  let app: Awaited<ReturnType<typeof createApp>>;
  beforeAll(async () => {
    await pool.query(
      `insert into organizations(id,legal_name,base_currency,timezone)values('org-erp510','ERP510','VND','Asia/Ho_Chi_Minh');insert into users(id,email,display_name)values('u510','u510@example.com','U510');insert into organization_memberships(organization_id,user_id)values('org-erp510','u510');insert into membership_roles(organization_id,user_id,role)values('org-erp510','u510','owner');insert into fiscal_years(organization_id,year,starts_on,ends_on)values('org-erp510',2026,'2026-01-01','2026-12-31');insert into fiscal_periods(organization_id,fiscal_year,period_number,starts_on,ends_on,state)values('org-erp510',2026,8,'2026-08-01','2026-08-31','open');insert into accounts(organization_id,code,name,root_type)values('org-erp510','642','Tools','expense');insert into parties(organization_id,id,display_name)values('org-erp510','client','Client');insert into projects(organization_id,id,code,name,client_party_id,owner_user_id,contract_type,currency,budget_minor,starts_on,state)values('org-erp510','p1','P1','P1','client','u510','fixed_fee','VND',1000,'2026-01-01','active');insert into project_cost_items(organization_id,id,source_type,source_id,cost_class,basis,effective_on,ledger_account_code,amount_minor,base_amount_minor,currency,description,created_by)values('org-erp510','source','expense','expense-1','direct','management','2026-08-05','642',100,100,'VND','Tool','u510')`,
    );
    await pool.query(
      `insert into api_credentials(organization_id,id,actor_id,token_hash,roles)values('org-erp510','cred','u510',$1,'["owner"]')`,
      [createHash("sha256").update(token).digest("hex")],
    );
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
    await pool.end();
  });
  it("allocates exact source and enforces lifecycle", async () => {
    const h = (k: string) => ({ authorization: `Bearer ${token}`, "idempotency-key": k }),
      create = await app.inject({
        method: "POST",
        url: "/api/v1/organizations/org-erp510/direct-cost-allocations",
        headers: h("create"),
        payload: {
          schemaVersion: 1,
          id: "a1",
          sourceId: "source",
          reason: "Allocate",
          splits: [{ projectId: "p1", amountMinor: "100", baseAmountMinor: "100" }],
        },
      });
    expect(create.statusCode, create.body).toBe(201);
    for (const [action, version] of [
      ["submit", "1"],
      ["approve", "2"],
      ["post", "3"],
      ["reverse", "4"],
    ] as const) {
      const r = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/org-erp510/direct-cost-allocations/a1/${action}`,
        headers: h(action),
        payload: { schemaVersion: 1, expectedResourceVersion: version, reason: action },
      });
      expect(r.statusCode, r.body).toBe(201);
    }
    const detail = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-erp510/direct-cost-allocations/a1",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.json().data).toMatchObject({ state: "reversed" });
    expect(detail.json().data.journalId).toBeTruthy();
    expect(detail.json().data.reversalJournalId).toBeTruthy();
    const journals = await pool.query(
      `select count(*)::int count from journal_entries where organization_id='org-erp510' and(id=$1 or id=$2)`,
      [detail.json().data.journalId, detail.json().data.reversalJournalId],
    );
    expect(journals.rows[0]?.count).toBe(2);
  });
});
