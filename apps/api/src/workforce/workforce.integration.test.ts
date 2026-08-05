import { afterAll, beforeAll, expect, suite, test } from "vitest";
import pg from "pg";
import { createHash } from "node:crypto";
import { createApp } from "../bootstrap.js";
const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const dbSuite = enabled ? suite : suite.skip;
dbSuite("ERP-500 workforce PostgreSQL API", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const token = "erp500-token";
  const reviewerToken = "erp500-reviewer-token";
  let app: Awaited<ReturnType<typeof createApp>>;
  beforeAll(async () => {
    await pool.query(
      `insert into organizations(id,legal_name,base_currency,timezone)values('org-erp500','ERP500','VND','Asia/Ho_Chi_Minh');insert into users(id,email,display_name)values('user-erp500','erp500@example.com','ERP500'),('reviewer-erp500','reviewer-erp500@example.com','ERP500 Reviewer');insert into organization_memberships(organization_id,user_id)values('org-erp500','user-erp500'),('org-erp500','reviewer-erp500');insert into membership_roles(organization_id,user_id,role)values('org-erp500','user-erp500','owner'),('org-erp500','reviewer-erp500','owner');insert into parties(organization_id,id,display_name)values('org-erp500','party-worker','Worker');insert into party_roles(organization_id,party_id,role)values('org-erp500','party-worker','employee');`,
    );
    await pool.query(
      "insert into api_credentials(organization_id,id,actor_id,token_hash,roles)values('org-erp500','cred','user-erp500',$1,'[\"owner\"]')",
      [createHash("sha256").update(token).digest("hex")],
    );
    await pool.query(
      "insert into api_credentials(organization_id,id,actor_id,token_hash,roles)values('org-erp500','reviewer-cred','reviewer-erp500',$1,'[\"owner\"]')",
      [createHash("sha256").update(reviewerToken).digest("hex")],
    );
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
    await pool.end();
  });
  const headers = { authorization: `Bearer ${token}`, "x-correlation-id": "corr" };
  const reviewerHeaders = {
    authorization: `Bearer ${reviewerToken}`,
    "x-correlation-id": "reviewer-corr",
  };
  test("creates worker, snapshots approved labor cost, and summarizes capacity", async () => {
    const server = app.getHttpAdapter().getInstance();
    const runKey = `${Date.now()}`;
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/api/v1/organizations/org-erp500/time/workers",
          headers: { ...headers, "idempotency-key": "worker" },
          payload: {
            schemaVersion: 1,
            id: "worker",
            workerPartyId: "party-worker",
            userId: "user-erp500",
            employmentKind: "employee",
            startsOn: "2026-08-01",
          },
        })
      ).statusCode,
    ).toBe(201);
    const rateCreated = await server.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp500/time/cost-rates",
      headers: { ...headers, "idempotency-key": "rate" },
      payload: {
        schemaVersion: 1,
        id: "rate",
        workerId: "worker",
        basis: "fully_loaded",
        rateMinorPerHour: "60000",
        currency: "VND",
        effectiveFrom: "2026-08-01",
      },
    });
    expect(rateCreated.statusCode, rateCreated.body).toBe(201);
    const rateApproved = await server.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp500/time/cost-rates/rate/approve",
      headers: { ...reviewerHeaders, "idempotency-key": "rate-approve" },
      payload: {
        schemaVersion: 1,
        expectedResourceVersion: rateCreated.json().data.resource.resourceVersion,
        reason: "Approved",
      },
    });
    expect(rateApproved.statusCode, rateApproved.body).toBe(201);
    const timesheetCreated = await server.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp500/time/capacity-versions",
      headers: { ...headers, "idempotency-key": "capacity" },
      payload: {
        schemaVersion: 1,
        id: "cap",
        workerId: "worker",
        weeklyCapacityMinutes: 2400,
        workdays: [1, 2, 3, 4, 5],
        effectiveFrom: "2026-08-03",
        reason: "Standard",
      },
    });
    expect(timesheetCreated.statusCode, timesheetCreated.body).toBe(201);
    const submitted = await server.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp500/time/timesheets",
      headers: { ...headers, "idempotency-key": "ts" },
      payload: {
        schemaVersion: 1,
        id: "ts",
        workerId: "worker",
        weekStartsOn: "2026-08-03",
        reason: "Weekly time",
        entries: [
          {
            id: "entry",
            workDate: "2026-08-03",
            mode: "allocation",
            workClassification: "internal",
            minutes: 60,
            billingClassification: "non_billable",
            description: "Internal",
            allocationPercent: 100,
          },
        ],
      },
    });
    await server.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp500/time/timesheets/ts/submit",
      headers: { ...headers, "idempotency-key": `timesheet-submit-${runKey}` },
      payload: {
        schemaVersion: 1,
        expectedResourceVersion: timesheetCreated.json().data.resource.resourceVersion,
        reason: "Submit",
      },
    });
    expect(submitted.statusCode, submitted.body).toBe(201);
    expect(submitted.json().data.idempotencyReplayed).not.toBe(true);
    expect(submitted.json().data.resource.state).toBe("submitted");
    expect(
      (
        await pool.query(
          "select state from timesheets where organization_id='org-erp500' and id='ts'",
        )
      ).rows[0]?.state,
    ).toBe("submitted");
    const approved = await server.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp500/time/timesheets/ts/approve",
      headers: { ...reviewerHeaders, "idempotency-key": `timesheet-approve-${runKey}` },
      payload: {
        schemaVersion: 1,
        expectedResourceVersion: submitted.json().data.resource.resourceVersion,
        reason: "Approve",
      },
    });
    expect(approved.statusCode, approved.body).toBe(201);
    const detail = await server.inject({
      method: "GET",
      url: "/api/v1/organizations/org-erp500/time/timesheets/ts",
      headers,
    });
    expect(detail.json().data.entries[0].appliedCost).toMatchObject({
      costMinor: "60000",
    });
    const summary = await server.inject({
      method: "GET",
      url: "/api/v1/organizations/org-erp500/time/capacity-summary?from=2026-08-03&to=2026-08-09",
      headers,
    });
    expect(summary.json().data.items[0]).toMatchObject({ workerId: "worker", approvedMinutes: 60 });
  });
});
