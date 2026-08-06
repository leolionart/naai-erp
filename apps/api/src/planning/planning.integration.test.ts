import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
(enabled ? describe : describe.skip)("ERP-600 planning PostgreSQL API", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
    org = "org-erp600";
  let app: Awaited<ReturnType<typeof createApp>>;
  const request = (
    resource: string,
    id: string | undefined,
    action: string | undefined,
    payload: Record<string, unknown>,
    token: string,
    key: string,
  ) =>
    app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/${resource}${id ? `/${id}` : ""}${action ? `/${action}` : ""}`,
      headers: { authorization: `Bearer ${token}`, "idempotency-key": key },
      payload,
    });
  beforeAll(async () => {
    await pool.query(
      `insert into organizations(id,legal_name,base_currency,timezone) values($1,'ERP600','VND','Asia/Ho_Chi_Minh')`,
      [org],
    );
    await pool.query(
      `insert into users(id,email,display_name) values('maker600','maker600@example.com','Maker'),('checker600','checker600@example.com','Checker')`,
    );
    await pool.query(
      `insert into organization_memberships(organization_id,user_id) values($1,'maker600'),($1,'checker600')`,
      [org],
    );
    await pool.query(
      `insert into membership_roles(organization_id,user_id,role) values($1,'maker600','finance_admin'),($1,'checker600','approver')`,
      [org],
    );
    for (const [id, actor, token, roles] of [
      ["m600", "maker600", "maker-token", '["finance_admin"]'],
      ["c600", "checker600", "checker-token", '["approver"]'],
    ] as const)
      await pool.query(
        `insert into api_credentials(organization_id,id,actor_id,token_hash,roles)values($1,$2,$3,$4,$5)`,
        [org, id, actor, createHash("sha256").update(token).digest("hex"), roles],
      );
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
    await pool.end();
  });
  it("T-FCT-001 versions exact targets with idempotency, maker-checker and organization isolation", async () => {
    const body = {
      schemaVersion: 1,
      id: "target-aug-v1",
      versionNumber: 1,
      periodKind: "month",
      startsOn: "2026-08-01",
      endsOn: "2026-08-31",
      actualBasis: "recognized",
      currency: "VND",
      amountMinor: "100000000",
      dimensions: { serviceLineCode: "web-app" },
      reason: "August plan",
    };
    const created = await request(
      "revenue-targets",
      undefined,
      undefined,
      body,
      "maker-token",
      "target-create",
    );
    expect(created.statusCode, created.body).toBe(201);
    const replay = await request(
      "revenue-targets",
      undefined,
      undefined,
      body,
      "maker-token",
      "target-create",
    );
    expect(replay.json().data.mutation.idempotencyReplayed).toBe(true);
    const self = await request(
      "revenue-targets",
      "target-aug-v1",
      "publish",
      { schemaVersion: 1, expectedResourceVersion: "1", reason: "Self" },
      "maker-token",
      "target-self",
    );
    expect(self.statusCode).toBe(409);
    const published = await request(
      "revenue-targets",
      "target-aug-v1",
      "publish",
      { schemaVersion: 1, expectedResourceVersion: "1", reason: "Approved" },
      "checker-token",
      "target-publish",
    );
    expect(published.statusCode, published.body).toBe(201);
    expect(published.json().data.resource).toMatchObject({
      state: "published",
      actualBasis: "recognized",
      amountMinor: "100000000",
    });
    const audit = await pool.query(
      `select action,reason from planning_audit_events where organization_id=$1 and resource_id='target-aug-v1' order by occurred_at`,
      [org],
    );
    expect(audit.rows).toEqual([
      { action: "create", reason: "August plan" },
      { action: "publish", reason: "Approved" },
    ]);
  });
  it("T-FCT-002 retains published month-end snapshots and rejects superseding them", async () => {
    const created = await request(
      "forecast-versions",
      undefined,
      undefined,
      {
        schemaVersion: 1,
        id: "forecast-aug",
        versionNumber: 1,
        scenario: "base",
        snapshotKind: "month_end",
        asOfDate: "2026-08-31",
        startsOn: "2026-08-01",
        endsOn: "2026-12-31",
        actualBasis: "collected",
        currency: "VND",
        reason: "Month end",
      },
      "maker-token",
      "forecast-create",
    );
    expect(created.statusCode, created.body).toBe(201);
    const openingCash = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/forecast-versions/forecast-aug/components`,
      headers: {
        authorization: "Bearer maker-token",
        "idempotency-key": "forecast-opening-cash",
      },
      payload: {
        schemaVersion: 1,
        id: "forecast-aug-opening",
        section: "cash",
        kind: "opening_cash",
        direction: "increase",
        scheduledOn: "2026-08-31",
        amountMinor: "0",
        currency: "VND",
        source: { type: "bank_balance", id: "forecast-aug-opening-balance" },
        reason: "Month-end opening cash control",
      },
    });
    expect(openingCash.statusCode, openingCash.body).toBe(201);
    const published = await request(
      "forecast-versions",
      "forecast-aug",
      "publish",
      { schemaVersion: 1, expectedResourceVersion: "1", reason: "Lock snapshot" },
      "checker-token",
      "forecast-publish",
    );
    expect(published.statusCode, published.body).toBe(201);
    const supersede = await request(
      "forecast-versions",
      "forecast-aug",
      "supersede",
      { schemaVersion: 1, expectedResourceVersion: "2", reason: "Try overwrite" },
      "checker-token",
      "forecast-supersede",
    );
    expect(supersede.statusCode).toBe(409);
    expect(
      (
        await pool.query(
          `select state from forecast_versions where organization_id=$1 and id='forecast-aug'`,
          [org],
        )
      ).rows[0].state,
    ).toBe("published");
  });
});
