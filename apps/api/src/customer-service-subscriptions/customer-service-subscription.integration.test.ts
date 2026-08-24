import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-885 service-plan quick create", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const organizationId = `org-plan-${randomUUID()}`;
  const token = `plan-token-${randomUUID()}`;
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    await pool.query(
      `insert into organizations(id,legal_name,base_currency,timezone) values($1,'Plan Org','VND','Asia/Ho_Chi_Minh')`,
      [organizationId],
    );
    await pool.query(
      `insert into dimension_values(organization_id,kind,code,name,is_active) values
         ($1,'service_line','CONSULTING','Tư vấn',true),
         ($1,'service_line','RETAINER_FEE','Dịch vụ định kỳ',true)`,
      [organizationId],
    );
    await pool.query(
      `insert into api_credentials(organization_id,id,actor_id,token_hash,roles) values($1,'plan-owner','owner',$2,'["owner"]')`,
      [organizationId, createHash("sha256").update(token).digest("hex")],
    );
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await pool.query("delete from resource_audit_events where organization_id=$1", [
      organizationId,
    ]);
    await pool.query("delete from api_idempotency_records where organization_id=$1", [
      organizationId,
    ]);
    await pool.query("delete from service_plans where organization_id=$1", [organizationId]);
    await pool.query("delete from api_credentials where organization_id=$1", [organizationId]);
    await pool.query("delete from dimension_values where organization_id=$1", [organizationId]);
    await pool.query("delete from organizations where id=$1", [organizationId]);
    await pool.end();
  });

  it("creates from name and price while resolving defaults and code collisions", async () => {
    const create = (key: string) =>
      app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/service-plans`,
        headers: { authorization: `Bearer ${token}`, "idempotency-key": key },
        payload: {
          schemaVersion: 1,
          name: "Dịch vụ quản trị website",
          defaultUnitPriceMinor: "500000",
        },
      });
    const first = await create("plan-quick-1");
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json().data.resource).toMatchObject({
      code: "DICH-VU-QUAN-TRI-WEBSITE",
      serviceLineCode: "RETAINER_FEE",
      defaultUnitPriceMinor: "500000",
      currency: "VND",
      recurrence: { frequency: "month", interval: 1, billingDay: 1 },
    });
    const second = await create("plan-quick-2");
    expect(second.statusCode, second.body).toBe(201);
    expect(second.json().data.resource.code).toBe("DICH-VU-QUAN-TRI-WEBSITE-2");
  });

  it("hard-deletes only an unreferenced plan with concurrency and audit controls", async () => {
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/service-plans`,
      headers: { authorization: `Bearer ${token}`, "idempotency-key": "delete-plan-create" },
      payload: { schemaVersion: 1, name: "Temporary plan", defaultUnitPriceMinor: "100" },
    });
    const plan = created.json().data.resource;
    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/v1/organizations/${organizationId}/service-plans/${plan.id}`,
      headers: {
        authorization: `Bearer ${token}`,
        "idempotency-key": "delete-plan-commit",
        "if-match": plan.resourceVersion,
      },
      payload: { schemaVersion: 1, reason: "Created by mistake" },
    });
    expect(deleted.statusCode, deleted.body).toBe(200);
    expect(deleted.json().data.resource).toMatchObject({ id: plan.id, deleted: true });
    const readback = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${organizationId}/service-plans/${plan.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(readback.statusCode).toBe(404);
  });
});
