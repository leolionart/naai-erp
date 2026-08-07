import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
(enabled ? describe : describe.skip)("ERP-620 performance comparison PostgreSQL API", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
    org = "org-erp620";
  let app: Awaited<ReturnType<typeof createApp>>;
  beforeAll(async () => {
    await pool.query(
      `insert into organizations(id,legal_name,base_currency,timezone) values($1,'ERP620','VND','Asia/Ho_Chi_Minh')`,
      [org],
    );
    await pool.query(
      `insert into users(id,email,display_name) values('user620','user620@example.com','User 620')`,
    );
    await pool.query(
      `insert into organization_memberships(organization_id,user_id) values($1,'user620')`,
      [org],
    );
    await pool.query(
      `insert into membership_roles(organization_id,user_id,role) values($1,'user620','finance_admin')`,
      [org],
    );
    await pool.query(
      `insert into api_credentials(organization_id,id,actor_id,token_hash,roles) values($1,'cred620','user620',$2,'["finance_admin"]')`,
      [org, createHash("sha256").update("token620").digest("hex")],
    );
    await pool.query(
      `insert into fiscal_years(organization_id,year,starts_on,ends_on) values($1,2023,'2022-12-26','2023-12-25'),($1,2024,'2023-12-26','2024-12-25')`,
      [org],
    );
    await pool.query(
      `insert into fiscal_periods(organization_id,fiscal_year,period_number,starts_on,ends_on) values($1,2023,2,'2023-01-26','2023-02-25'),($1,2024,1,'2023-12-26','2024-01-25'),($1,2024,2,'2024-01-26','2024-02-25')`,
      [org],
    );
    await pool.query(
      `insert into parties(organization_id,id,display_name) values($1,'client620','Client')`,
      [org],
    );
    await pool.query(
      `insert into projects(organization_id,id,code,name,client_party_id,owner_user_id,contract_type,currency,budget_minor,starts_on,state) values($1,'project620','P620','Project','client620','user620','fixed_fee','VND',1000000000,'2023-01-01','active')`,
      [org],
    );
    await pool.query(
      `insert into revenue_recognition_policies(organization_id,id,project_id,version_number,method,effective_from,currency,contract_value_minor,revenue_account_code,contract_asset_account_code,contract_liability_account_code,evidence_required,state,created_by) values($1,'policy620','project620',1,'milestone','2023-01-01','VND',1000000000,'511','131','3387',false,'approved','user620')`,
      [org],
    );
    const facts = [
      ["cal-current", "2024-02-15", "120000000", "calendar"],
      ["cal-mom", "2024-01-15", "100000000", "calendar"],
      ["cal-yoy", "2023-02-15", "80000000", "calendar"],
      ["fiscal-current", "2024-02-15", "168000000", "fiscal"],
      ["fiscal-mom", "2024-01-15", "140000000", "fiscal"],
      ["fiscal-yoy", "2023-02-15", "130000000", "fiscal"],
      ["zero-current", "2024-02-15", "10000000", "zero"],
      ["zero-mom", "2024-01-15", "0", "zero"],
      ["missing-current", "2024-02-15", "50000000", "missing"],
    ];
    for (const [id, on, amount, team] of facts) {
      await pool.query(
        `insert into revenue_recognition_events(organization_id,id,project_id,policy_id,policy_version_number,effective_on,amount_minor,currency,policy_snapshot,state,posted_by,posted_at,reason,created_by) values($1,$2,'project620','policy620',1,$3,$4,'VND','{}','posted','user620',now(),'Fixture','user620')`,
        [org, id, on, amount === "0" ? "1" : amount],
      );
      await pool.query(
        `insert into planning_actual_facts(organization_id,id,actual_basis,effective_on,amount_minor,currency,source_type,source_id,source_version,dimensions) values($1,$2,'recognized',$3,$4,'VND','revenue_recognition_event',$2,'1',$5)`,
        [org, id, on, amount, JSON.stringify({ teamId: team })],
      );
    }
    await pool.query(
      `insert into revenue_target_versions(organization_id,id,version_number,period_kind,starts_on,ends_on,actual_basis,currency,amount_minor,team_id,state,version,reason,created_by,published_by,published_at) values($1,'target-cal',1,'month','2024-02-01','2024-02-29','recognized','VND',290000000,'calendar','published',2,'Fixture','user620','user620',now()),($1,'target-fiscal',1,'month','2024-01-26','2024-02-25','recognized','VND',310000000,'fiscal','published',2,'Fixture','user620','user620',now())`,
      [org],
    );
    await pool.query(
      `insert into forecast_versions(organization_id,id,version_number,scenario,snapshot_kind,as_of_date,starts_on,ends_on,actual_basis,currency,team_id,state,version,reason,created_by,published_by,published_at,composition_snapshot,composition_snapshotted_at) values($1,'forecast-cal',1,'base','month_end','2024-02-15','2024-02-01','2024-02-29','recognized','VND','calendar','published',2,'Fixture','user620','user620',now(),'{"projectedRevenueMinor":"270000000"}',now())`,
      [org],
    );
    await pool.query(
      `insert into revenue_recognition_events(organization_id,id,project_id,policy_id,policy_version_number,effective_on,amount_minor,currency,policy_snapshot,state,posted_by,posted_at,reason,created_by) values($1,'recognition620','project620','policy620',1,'2024-03-10',5000000,'VND','{}','posted','user620',now(),'Fixture','user620')`,
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
  const get = (query: string) =>
    app.inject({
      method: "GET",
      url: `/api/v1/organizations/${org}${query}`,
      headers: { authorization: "Bearer token620" },
    });
  it("T-KPI-001 resolves Asia/Ho_Chi_Minh calendar and fiscal comparable windows", async () => {
    const calendar = await get(
      `/reports/performance-comparisons?periodId=CAL-2024-02&periodBasis=calendar&actualBasis=recognized&asOfInstant=2024-02-15T16:59:59Z&forecastVersionId=forecast-cal&teamId=calendar`,
    );
    expect(calendar.statusCode, calendar.body).toBe(200);
    expect(calendar.json().data).toMatchObject({
      asOfLocalDate: "2024-02-15",
      elapsedDays: 15,
      periodDays: 29,
      proratedTargetMinor: "150000000",
      actualVsProratedTarget: { varianceMinor: "-30000000", varianceBps: -2000, ratioBps: 8000 },
      actualVsFullTarget: { varianceMinor: "-170000000", varianceBps: -5862, ratioBps: 4138 },
      forecastVsFullTarget: { varianceMinor: "-20000000", varianceBps: -690, ratioBps: 9310 },
      actualVsRetainedForecast: {
        numeratorMinor: "120000000",
        denominatorMinor: "270000000",
        varianceMinor: "-150000000",
        varianceBps: -5556,
        ratioBps: 4444,
      },
      monthOverMonth: { varianceMinor: "20000000", varianceBps: 2000, ratioBps: 12000 },
      yearOverYear: { varianceMinor: "40000000", varianceBps: 5000, ratioBps: 15000 },
    });
    const fiscal = await get(
      `/reports/performance-comparisons?periodId=FY2024-P02&periodBasis=fiscal&actualBasis=recognized&asOfInstant=2024-02-15T16:59:59Z&teamId=fiscal`,
    );
    expect(fiscal.statusCode, fiscal.body).toBe(200);
    expect(fiscal.json().data).toMatchObject({
      proratedTargetMinor: "210000000",
      actualVsProratedTarget: { varianceMinor: "-42000000", varianceBps: -2000, ratioBps: 8000 },
    });
  });
  it("T-KPI-002 backfills organization-scoped actual facts idempotently and preserves zero/null policy", async () => {
    const payload = {
      schemaVersion: 1,
      actualBasis: "recognized",
      from: "2024-03-01",
      to: "2024-03-31",
      reason: "Refresh March",
    };
    const first = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/planning-actual-facts/backfill`,
      headers: { authorization: "Bearer token620", "idempotency-key": "backfill620" },
      payload,
    });
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json().data.refreshedCount).toBe(1);
    const replay = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/planning-actual-facts/backfill`,
      headers: { authorization: "Bearer token620", "idempotency-key": "backfill620" },
      payload,
    });
    expect(replay.json().data.mutation.idempotencyReplayed).toBe(true);
    const facts = await get(
      `/planning-actual-facts?actualBasis=recognized&from=2024-03-01&to=2024-03-31`,
    );
    expect(facts.json().data.items).toEqual([
      expect.objectContaining({ amountMinor: "5000000", sourceId: "recognition620" }),
    ]);
    const zero = await get(
      `/reports/performance-comparisons?periodId=CAL-2024-02&periodBasis=calendar&actualBasis=recognized&asOfInstant=2024-02-15T16:59:59Z&teamId=zero`,
    );
    expect(zero.statusCode, zero.body).toBe(200);
    expect(zero.json().data.monthOverMonth).toMatchObject({
      status: "zero_denominator",
      numeratorMinor: "10000000",
      denominatorMinor: "0",
      varianceMinor: "10000000",
      ratioBps: null,
      varianceBps: null,
    });
    const missing = await get(
      `/reports/performance-comparisons?periodId=CAL-2024-02&periodBasis=calendar&actualBasis=recognized&asOfInstant=2024-02-15T16:59:59Z&teamId=missing`,
    );
    expect(missing.statusCode, missing.body).toBe(200);
    expect(missing.json().data.yearOverYear).toMatchObject({
      status: "missing",
      denominatorMinor: null,
      varianceMinor: null,
      ratioBps: null,
      varianceBps: null,
    });
  });

  it("T-API-ERP-800-003 aggregates actual facts across an explicit multi-month range", async () => {
    const summary = await get(
      `/planning-actual-facts/summary?actualBasis=recognized&from=2024-01-01&to=2024-02-29&teamId=calendar`,
    );
    expect(summary.statusCode, summary.body).toBe(200);
    expect(summary.json().data).toMatchObject({
      actualBasis: "recognized",
      from: "2024-01-01",
      to: "2024-02-29",
      currency: "VND",
      amountMinor: "220000000",
      factCount: 2,
    });
  });
});
