import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-857 worker update and deactivate", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const org = `org-worker-${randomUUID()}`;
  const user = `user-worker-${randomUUID()}`;
  const token = `token-worker-${randomUUID()}`;
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    await pool.query(
      "insert into organizations(id,legal_name,base_currency,timezone) values($1,'Worker Test','VND','Asia/Ho_Chi_Minh')",
      [org],
    );
    await pool.query("insert into users(id,email,display_name) values($1,$2,'Worker Owner')", [
      user,
      `${user}@example.com`,
    ]);
    await pool.query(
      "insert into organization_memberships(organization_id,user_id) values($1,$2)",
      [org, user],
    );
    await pool.query(
      "insert into parties(organization_id,id,display_name) values($1,'worker-party','Worker Party')",
      [org],
    );
    await pool.query(
      `insert into workforce_profiles(organization_id,id,party_id,user_id,kind,starts_on,created_by,updated_by)
       values($1,'worker','worker-party',$2,'employee','2026-01-01',$2,$2)`,
      [org, user],
    );
    await pool.query(
      `insert into api_credentials(organization_id,id,actor_id,token_hash,roles)
       values($1,'worker-credential',$2,$3,'["owner"]')`,
      [org, user, createHash("sha256").update(token).digest("hex")],
    );
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  it("updates then deactivates once with audit and idempotent replay", async () => {
    const update = await app.inject({
      method: "PATCH",
      url: `/api/v1/organizations/${org}/time/workers/worker`,
      headers: {
        authorization: `Bearer ${token}`,
        "if-match": "1",
        "idempotency-key": "worker-update",
      },
      payload: {
        schemaVersion: 1,
        employmentKind: "contractor",
        endsOn: "2026-12-31",
        reason: "Payroll classification corrected",
      },
    });
    expect(update.statusCode, update.body).toBe(200);
    expect(update.json().data.resource).toMatchObject({
      employmentKind: "contractor",
      endsOn: "2026-12-31",
      resourceVersion: "2",
    });
    const request = () =>
      app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/time/workers/worker/deactivate`,
        headers: {
          authorization: `Bearer ${token}`,
          "if-match": "2",
          "idempotency-key": "worker-deactivate",
        },
        payload: { schemaVersion: 1, reason: "Employment ended" },
      });
    const deactivated = await request();
    expect(deactivated.statusCode, deactivated.body).toBe(201);
    expect(deactivated.json().data.resource).toMatchObject({
      status: "inactive",
      resourceVersion: "3",
    });
    expect((await request()).json().data.idempotencyReplayed).toBe(true);
    const audit = await pool.query<{ count: number }>(
      `select count(*)::int count from resource_audit_events
        where organization_id=$1 and resource_type='workforce_profile' and resource_key='worker'`,
      [org],
    );
    expect(audit.rows[0]?.count).toBe(2);
  });
});
