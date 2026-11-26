import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgOperationalLogStore } from "./pg-operational-log.store.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe.sequential : describe.skip;

describeIntegration("PostgreSQL unified activity timeline", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const org = `org-act-${Date.now()}`;

  beforeAll(async () => {
    await pool.query(
      "insert into organizations(id,legal_name,base_currency,timezone) values($1,'Act','VND','Asia/Ho_Chi_Minh')",
      [org],
    );
    await pool.query(
      `insert into integration_sources(organization_id,id,public_id,name,actor_id,secret_ref,allowed_event_types,created_by)
       values($1,'src',$2,'n8n','robot','N8N_SECRET','["expense.create"]','admin')`,
      [org, `pub-act-${Date.now()}`],
    );
    await pool.query(
      `insert into inbound_messages(organization_id,id,source_id,idempotency_key,external_id,event_type,raw_payload,payload_sha256,signature_timestamp,state,last_error_code,last_error_summary,correlation_id)
       values($1,'m1','src','k1','ext-1','expense.create','{}',repeat('a',64),1,'processed',null,null,'c1'),
             ($1,'m2','src','k2','ext-2','expense.create','{}',repeat('b',64),1,'quarantined','VALIDATION_FAILED','Missing amount','c2')`,
      [org],
    );
  });
  afterAll(() => pool.end());

  it("lists inbound webhook receipts, marking quarantined payloads as failed", async () => {
    const store = new PgOperationalLogStore();
    const all = await store.listAll(org, {});
    const inbound = all.items.filter((item: { source: string }) => item.source === "inbound");
    expect(inbound).toHaveLength(2);
    const failed = inbound.find((item: { resource_key: string }) => item.resource_key === "ext-2");
    expect(failed).toMatchObject({
      status: "failed",
      severity: "error",
      summary: expect.stringContaining("VALIDATION_FAILED"),
    });
    expect(
      inbound.find((item: { resource_key: string }) => item.resource_key === "ext-1"),
    ).toMatchObject({
      status: "succeeded",
    });
    const onlyFailed = await store.listAll(org, { source: "inbound", status: "failed" });
    expect(onlyFailed.items.map((item: { resource_key: string }) => item.resource_key)).toEqual([
      "ext-2",
    ]);
  });
});
