import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
(enabled ? describe : describe.skip)("ERP-520 project economics PostgreSQL API", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let app: Awaited<ReturnType<typeof createApp>>;
  const org = "org-erp520",
    makerToken = "erp520-maker",
    checkerToken = "erp520-checker";
  const headers = (token: string, key?: string) => ({
    authorization: `Bearer ${token}`,
    ...(key ? { "idempotency-key": key } : {}),
  });
  const mutate = async (
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
      headers: headers(token, key),
      payload,
    });

  beforeAll(async () => {
    await pool.query(`
      insert into organizations(id,legal_name,base_currency,timezone) values('${org}','ERP520','VND','Asia/Ho_Chi_Minh');
      insert into users(id,email,display_name) values('maker520','maker520@example.com','Maker'),('checker520','checker520@example.com','Checker');
      insert into organization_memberships(organization_id,user_id) values('${org}','maker520'),('${org}','checker520');
      insert into membership_roles(organization_id,user_id,role) values('${org}','maker520','owner'),('${org}','checker520','owner');
      insert into parties(organization_id,id,display_name) values('${org}','client520','Client');
      insert into projects(organization_id,id,code,name,client_party_id,owner_user_id,contract_type,currency,budget_minor,starts_on,state) values('${org}','p520','P520','Project 520','client520','maker520','fixed_fee','VND',1000,'2026-01-01','active');
      insert into contracts(organization_id,id,project_id,reference,signed_on,value_minor,currency) values('${org}','contract520','p520','C520','2026-01-01',1000,'VND');
      insert into milestones(organization_id,id,contract_id,name,due_on,amount_minor,sequence) values('${org}','milestone520','contract520','Acceptance','2026-08-01',1000,1);
      insert into evidence_records(organization_id,id,subject_type,subject_id,evidence_type,created_by) values('${org}','evidence520','milestone','milestone520','client_acceptance','maker520');
      insert into fiscal_years(organization_id,year,starts_on,ends_on) values('${org}',2026,'2026-01-01','2026-12-31');
      insert into fiscal_periods(organization_id,fiscal_year,period_number,starts_on,ends_on,state) values('${org}',2026,8,'2026-08-01','2026-08-31','open');
      insert into accounts(organization_id,code,name,root_type,allow_manual_posting) values('${org}','131','Contract asset','asset',false),('${org}','3387','Contract liability','liability',false),('${org}','511','Service revenue','revenue',false);
    `);
    for (const [id, actor, token, roles] of [
      ["maker-cred", "maker520", makerToken, ["owner"]],
      ["checker-cred", "checker520", checkerToken, ["owner"]],
    ] as const)
      await pool.query(
        `insert into api_credentials(organization_id,id,actor_id,token_hash,roles) values($1,$2,$3,$4,$5)`,
        [org, id, actor, createHash("sha256").update(token).digest("hex"), JSON.stringify(roles)],
      );
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  it("enforces maker-checker, milestone and cumulative caps, then posts and reverses atomically", async () => {
    const policy = await mutate(
      "recognition-policies",
      undefined,
      undefined,
      {
        schemaVersion: 1,
        id: "policy520",
        projectId: "p520",
        versionNumber: 1,
        method: "milestone",
        effectiveFrom: "2026-01-01",
        currency: "VND",
        contractValueMinor: "1000",
        revenueAccountCode: "511",
        contractAssetAccountCode: "131",
        contractLiabilityAccountCode: "3387",
        evidenceRequired: true,
        reason: "Policy",
      },
      makerToken,
      "policy-create",
    );
    expect(policy.statusCode, policy.body).toBe(201);
    expect(
      (
        await mutate(
          "recognition-policies",
          "policy520",
          "submit",
          { schemaVersion: 1, expectedResourceVersion: "1", reason: "Submit" },
          makerToken,
          "policy-submit",
        )
      ).statusCode,
    ).toBe(201);
    const selfApprove = await mutate(
      "recognition-policies",
      "policy520",
      "approve",
      { schemaVersion: 1, expectedResourceVersion: "2", reason: "Approve" },
      makerToken,
      "policy-self",
    );
    expect(selfApprove.statusCode).toBe(409);
    expect(
      (
        await mutate(
          "recognition-policies",
          "policy520",
          "approve",
          { schemaVersion: 1, expectedResourceVersion: "2", reason: "Approve" },
          checkerToken,
          "policy-approve",
        )
      ).statusCode,
    ).toBe(201);

    const acceptanceCreated = await mutate(
      "milestone-acceptances",
      undefined,
      undefined,
      {
        schemaVersion: 1,
        id: "accept520",
        milestoneId: "milestone520",
        acceptedAmountMinor: "600",
        effectiveOn: "2026-08-05",
        evidenceIds: ["evidence520"],
        reason: "Client accepted",
      },
      makerToken,
      "accept-create",
    );
    expect(acceptanceCreated.statusCode, acceptanceCreated.body).toBe(201);
    expect(
      (
        await mutate(
          "milestone-acceptances",
          "accept520",
          "submit",
          { schemaVersion: 1, expectedResourceVersion: "1", reason: "Submit" },
          makerToken,
          "accept-submit",
        )
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await mutate(
          "milestone-acceptances",
          "accept520",
          "accept",
          { schemaVersion: 1, expectedResourceVersion: "2", reason: "Verify evidence" },
          checkerToken,
          "accept-accept",
        )
      ).statusCode,
    ).toBe(201);

    expect(
      (
        await mutate(
          "revenue-recognition-events",
          undefined,
          undefined,
          {
            schemaVersion: 1,
            id: "event520",
            projectId: "p520",
            policyId: "policy520",
            milestoneAcceptanceId: "accept520",
            effectiveOn: "2026-08-05",
            amountMinor: "600",
            currency: "VND",
            evidenceIds: ["evidence520"],
            reason: "Recognize accepted milestone",
          },
          makerToken,
          "event-create",
        )
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await mutate(
          "revenue-recognition-events",
          "event520",
          "submit",
          { schemaVersion: 1, expectedResourceVersion: "1", reason: "Submit" },
          makerToken,
          "event-submit",
        )
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await mutate(
          "revenue-recognition-events",
          "event520",
          "approve",
          { schemaVersion: 1, expectedResourceVersion: "2", reason: "Approve" },
          checkerToken,
          "event-approve",
        )
      ).statusCode,
    ).toBe(201);
    const excess = await mutate(
      "revenue-recognition-events",
      undefined,
      undefined,
      {
        schemaVersion: 1,
        id: "excess520",
        projectId: "p520",
        policyId: "policy520",
        milestoneAcceptanceId: "accept520",
        effectiveOn: "2026-08-05",
        amountMinor: "1",
        currency: "VND",
        evidenceIds: ["evidence520"],
        reason: "Excess",
      },
      makerToken,
      "excess-create",
    );
    expect(excess.statusCode).toBe(201);
    await mutate(
      "revenue-recognition-events",
      "excess520",
      "submit",
      { schemaVersion: 1, expectedResourceVersion: "1", reason: "Submit" },
      makerToken,
      "excess-submit",
    );
    expect(
      (
        await mutate(
          "revenue-recognition-events",
          "excess520",
          "approve",
          { schemaVersion: 1, expectedResourceVersion: "2", reason: "Approve" },
          checkerToken,
          "excess-approve",
        )
      ).statusCode,
    ).toBe(409);
    const posted = await mutate(
      "revenue-recognition-events",
      "event520",
      "post",
      { schemaVersion: 1, expectedResourceVersion: "3", reason: "Post" },
      checkerToken,
      "event-post",
    );
    expect(posted.statusCode, posted.body).toBe(201);
    expect(posted.json().data.resource.journalId).toBeTruthy();
    const reversed = await mutate(
      "revenue-recognition-events",
      "event520",
      "reverse",
      { schemaVersion: 1, expectedResourceVersion: "4", reason: "Correction" },
      checkerToken,
      "event-reverse",
    );
    expect(reversed.statusCode, reversed.body).toBe(201);
    expect(reversed.json().data.resource.reversalJournalId).toBeTruthy();
    const journals = await pool.query(
      `select count(*)::int n from journal_entries where organization_id=$1 and id in($2,$3)`,
      [org, posted.json().data.resource.journalId, reversed.json().data.resource.reversalJournalId],
    );
    expect(journals.rows[0]?.n).toBe(2);
    const axes = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${org}/project-revenue-position/p520?asOf=2026-08-31`,
      headers: headers(checkerToken),
    });
    expect(axes.statusCode).toBe(200);
    expect(axes.json().data).toMatchObject({
      recognizedRevenueMinor: "0",
      invoicedRevenueMinor: "0",
      collectedCashMinor: "0",
      axesAreIndependent: true,
    });
  });
});
