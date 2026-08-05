import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OutboundDeliveryRunner } from "./outbound-delivery.js";
import { PgOutboundDeliveryStore } from "./pg-outbound-delivery-store.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-340 PostgreSQL outbound delivery", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const store = new PgOutboundDeliveryStore(process.env.DATABASE_URL);

  beforeAll(async () => {
    process.env.ERP340_OUTBOUND_SECRET = "integration-secret";
    await pool.query(
      "insert into organizations(id,legal_name,base_currency,timezone) values('org-out','Outbound Org','VND','Asia/Ho_Chi_Minh')",
    );
    await pool.query(
      `insert into outbound_webhook_subscriptions
       (organization_id,id,name,endpoint_url,event_types,secret_ref,max_attempts,timeout_seconds,
        base_delay_seconds,max_delay_seconds,created_by,updated_by)
       values('org-out','endpoint-1','Endpoint 1','https://example.test/webhook',
        '["expense.created"]','ERP340_OUTBOUND_SECRET',3,5,30,3600,'admin','admin')`,
    );
  });

  afterAll(async () => {
    delete process.env.ERP340_OUTBOUND_SECRET;
    await store.close();
    await pool.end();
  });

  it("atomically materializes, leases and records a successful signed delivery", async () => {
    await pool.query(
      `insert into outbox_events
       (organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)
       values('org-out','event-success','expense','expense-1','expense.created',1,
        '{"expenseId":"expense-1"}','corr-success')`,
    );
    const requests: RequestInit[] = [];
    const runner = new OutboundDeliveryRunner(
      store,
      async (_url, init) => {
        requests.push(init);
        return { status: 204, text: async () => "" };
      },
      (ref) => process.env[ref],
      "worker-success",
    );
    expect(await runner.runBatch()).toMatchObject({ materialized: 1, leased: 1, delivered: 1 });
    const result = await pool.query(
      `select e.published_at,d.state,d.attempt_count,a.outcome
       from outbox_events e join outbound_deliveries d
         on d.organization_id=e.organization_id and d.outbox_event_id=e.id
       join outbound_delivery_attempts a
         on a.organization_id=d.organization_id and a.delivery_id=d.id
       where e.organization_id='org-out' and e.id='event-success'`,
    );
    expect(result.rows[0]).toMatchObject({
      state: "delivered",
      attempt_count: 1,
      outcome: "delivered",
    });
    expect(result.rows[0].published_at).toBeTruthy();
    expect(requests[0]?.headers).toMatchObject({
      "x-naai-event-id": "event-success",
      "x-naai-signature": expect.stringMatching(/^sha256=[0-9a-f]{64}$/),
    });
  });

  it("schedules transient failure and keeps attempt history append-only", async () => {
    await pool.query(
      `insert into outbox_events
       (organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)
       values('org-out','event-retry','expense','expense-2','expense.created',1,
        '{"expenseId":"expense-2"}','corr-retry')`,
    );
    const runner = new OutboundDeliveryRunner(
      store,
      async () => ({ status: 503, text: async () => "retry" }),
      (ref) => process.env[ref],
      "worker-retry",
    );
    await runner.runBatch();
    const delivery = await pool.query(
      `select state,attempt_count,next_attempt_at from outbound_deliveries
       where organization_id='org-out' and outbox_event_id='event-retry'`,
    );
    expect(delivery.rows[0].state).toBe("retry_scheduled");
    expect(delivery.rows[0].attempt_count).toBe(1);
    await expect(
      pool.query(
        `update outbound_delivery_attempts set error_summary='changed'
         where organization_id='org-out' and delivery_id='event-retry:endpoint-1'`,
      ),
    ).rejects.toThrow(/append-only/);
  });
});
