import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-340 outbound event admin API", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const token = "erp340-admin-token";
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    await pool.query(
      "insert into organizations(id,legal_name,base_currency,timezone) values('org-out-api','Outbound API Org','VND','Asia/Ho_Chi_Minh')",
    );
    await pool.query(
      `insert into api_credentials(organization_id,id,actor_id,token_hash,roles)
       values('org-out-api','outbound-admin','admin',$1,'["finance_admin"]')`,
      [createHash("sha256").update(token).digest("hex")],
    );
    await pool.query(
      `insert into outbound_webhook_subscriptions
       (organization_id,id,name,endpoint_url,event_types,secret_ref,created_by,updated_by)
       values('org-out-api','endpoint-api','Endpoint API','https://example.test/hook',
        '["journal.posted"]','ERP340_API_SECRET','admin','admin')`,
    );
    await pool.query(
      `insert into outbox_events
       (organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id,published_at)
       values('org-out-api','event-api','journal','journal-1','journal.posted',1,
        '{"journalId":"journal-1"}','corr-event',now())`,
    );
    await pool.query(
      `insert into outbound_deliveries
       (organization_id,id,outbox_event_id,subscription_id,state,attempt_count,dead_lettered_at,
        last_error_code,last_error_summary)
       values('org-out-api','delivery-api','event-api','endpoint-api','dead_letter',3,now(),
        'HTTP_503','Endpoint unavailable')`,
    );
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  function headers(key?: string) {
    return {
      authorization: `Bearer ${token}`,
      "x-correlation-id": "corr-api",
      ...(key ? { "idempotency-key": key } : {}),
    };
  }

  it("lists redacted endpoints, outbox state and delivery attempts by organization", async () => {
    const endpoints = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-out-api/outbound-events/endpoints",
      headers: headers(),
    });
    expect(endpoints.statusCode, endpoints.body).toBe(200);
    expect(endpoints.json().data.items[0]).not.toHaveProperty("secret_ref");
    const outbox = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-out-api/outbound-events/outbox?state=dead_letter",
      headers: headers(),
    });
    expect(outbox.statusCode, outbox.body).toBe(200);
    expect(outbox.json().data.items[0]).toMatchObject({ id: "event-api", state: "dead_letter" });
    const delivery = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-out-api/outbound-events/deliveries/delivery-api",
      headers: headers(),
    });
    expect(delivery.statusCode, delivery.body).toBe(200);
    expect(delivery.json().data).toMatchObject({ id: "delivery-api", state: "dead_letter" });
  });

  it("creates endpoint configuration idempotently without exposing the secret reference", async () => {
    const payload = {
      id: "endpoint-created",
      name: "Created endpoint",
      endpointUrl: "https://hooks.example.com/naai",
      eventTypes: ["expense.created"],
      secretRef: "ERP340_CREATED_SECRET",
    };
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-out-api/outbound-events/endpoints",
      headers: headers("endpoint-create-key"),
      payload,
    });
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json().data).not.toHaveProperty("secret_ref");
    expect(first.json().data).not.toHaveProperty("secretRef");
    const exact = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-out-api/outbound-events/endpoints",
      headers: headers("endpoint-create-key"),
      payload,
    });
    expect(exact.json().data.idempotencyReplayed).toBe(true);
    const rejected = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-out-api/outbound-events/endpoints",
      headers: headers("endpoint-private-key"),
      payload: { ...payload, id: "endpoint-private", endpointUrl: "https://127.0.0.1/hook" },
    });
    expect(rejected.statusCode).toBe(422);
  });

  it("replays dead-letter delivery once and conflicts on changed idempotent input", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-out-api/outbound-events/outbox/event-api/replay",
      headers: headers("replay-key"),
      payload: { reason: "Endpoint recovered", endpointId: "endpoint-api" },
    });
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json().data).toMatchObject({ state: "pending", replayedDeliveryCount: 1 });
    const exact = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-out-api/outbound-events/outbox/event-api/replay",
      headers: headers("replay-key"),
      payload: { reason: "Endpoint recovered", endpointId: "endpoint-api" },
    });
    expect(exact.json().data.idempotencyReplayed).toBe(true);
    const changed = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-out-api/outbound-events/outbox/event-api/replay",
      headers: headers("replay-key"),
      payload: { reason: "Changed reason", endpointId: "endpoint-api" },
    });
    expect(changed.statusCode).toBe(409);
    const audit = await pool.query(
      `select count(*)::int count from resource_audit_events
       where organization_id='org-out-api' and resource_type='outbox_event'
         and resource_key='event-api' and action='manual_replay'`,
    );
    expect(audit.rows[0].count).toBe(1);
  });
});
