import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-140 API to PostgreSQL", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let app: Awaited<ReturnType<typeof createApp>>;
  const token = "integration-secret";

  beforeAll(async () => {
    await pool.query(`
      insert into organizations (id, legal_name, base_currency, timezone)
      values ('org-api-a', 'API A', 'VND', 'Asia/Ho_Chi_Minh'),
             ('org-api-b', 'API B', 'VND', 'Asia/Ho_Chi_Minh');
    `);
    await pool.query(
      `insert into api_credentials (organization_id,id,actor_id,token_hash,roles)
       values ('org-api-a','cred-1','ai-integration',$1,'["integration"]')`,
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

  it("rejects missing auth and cross-organization credential use", async () => {
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/organizations/org-api-a/master-data/parties",
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/organizations/org-api-b/master-data/parties",
          headers: { authorization: `Bearer ${token}` },
        })
      ).statusCode,
    ).toBe(403);
  });

  it("creates once, replays idempotently and rejects conflicting payload", async () => {
    const request = {
      method: "POST" as const,
      url: "/api/v1/organizations/org-api-a/master-data/parties",
      headers: {
        authorization: `Bearer ${token}`,
        "idempotency-key": "idem-party-1",
        "x-correlation-id": "corr-party-1",
      },
      payload: { data: { id: "party-api-1", display_name: "AI Client", status: "active" } },
    };
    const first = await app.inject(request);
    expect(first.statusCode).toBe(201);
    expect(first.json().data.mutation.idempotencyReplayed).toBe(false);
    const replay = await app.inject(request);
    expect(replay.statusCode).toBe(201);
    expect(replay.json().data.mutation.idempotencyReplayed).toBe(true);
    const conflict = await app.inject({
      ...request,
      payload: { data: { id: "party-api-2", display_name: "Different", status: "active" } },
    });
    expect(conflict.statusCode).toBe(409);
    const audit = await pool.query(
      "select count(*)::int as count from resource_audit_events where organization_id='org-api-a' and resource_type='parties'",
    );
    expect(audit.rows[0].count).toBe(1);
  });
});
