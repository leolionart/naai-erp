/* eslint-disable @typescript-eslint/no-explicit-any -- Integration fixture inspects dynamic API envelopes. */
import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";
const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
(enabled ? describe : describe.skip)("ERP-530 overhead PostgreSQL API", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }),
    org = "org-erp530",
    maker = "erp530-maker",
    checker = "erp530-checker";
  let app: Awaited<ReturnType<typeof createApp>>;
  const h = (token: string, key?: string) => ({
      authorization: `Bearer ${token}`,
      ...(key ? { "idempotency-key": key } : {}),
    }),
    post = (
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
        headers: h(token, key),
        payload,
      });
  beforeAll(async () => {
    await pool.query(
      `insert into organizations(id,legal_name,base_currency,timezone)values('${org}','ERP530','VND','Asia/Ho_Chi_Minh');insert into accounts(organization_id,code,name,root_type)values('${org}','642','Shared overhead','expense');insert into users(id,email,display_name)values('maker530','maker530@example.com','Maker'),('checker530','checker530@example.com','Checker');insert into organization_memberships(organization_id,user_id)values('${org}','maker530'),('${org}','checker530');insert into membership_roles(organization_id,user_id,role)values('${org}','maker530','owner'),('${org}','checker530','owner');insert into parties(organization_id,id,display_name)values('${org}','client530','Client');insert into projects(organization_id,id,code,name,client_party_id,owner_user_id,contract_type,currency,budget_minor,starts_on,state)values('${org}','p530a','P530A','A','client530','maker530','fixed_fee','VND',1000,'2026-01-01','active'),('${org}','p530b','P530B','B','client530','maker530','fixed_fee','VND',1000,'2026-01-01','active');insert into fiscal_years(organization_id,year,starts_on,ends_on)values('${org}',2026,'2026-01-01','2026-12-31');insert into fiscal_periods(organization_id,fiscal_year,period_number,starts_on,ends_on,state)values('${org}',2026,8,'2026-08-01','2026-08-31','open');insert into project_cost_items(organization_id,id,source_type,source_id,cost_class,basis,effective_on,ledger_account_code,amount_minor,base_amount_minor,currency,description,created_by)values('${org}','oh530','expense','e530','overhead_reserved','management','2026-08-05','642',101,101,'VND','Shared overhead','maker530'),('${org}','oh530b','expense','e530b','overhead_reserved','management','2026-08-06','642',50,50,'VND','Second overhead','maker530')`,
    );
    for (const [id, actor, token] of [
      ["m530", "maker530", maker],
      ["c530", "checker530", checker],
    ] as const)
      await pool.query(
        `insert into api_credentials(organization_id,id,actor_id,token_hash,roles)values($1,$2,$3,$4,'["owner"]')`,
        [org, id, actor, createHash("sha256").update(token).digest("hex")],
      );
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
    await pool.end();
  });
  it("claims sources exclusively and produces deterministic locked-period allocations", async () => {
    expect(
      (
        await post(
          "overhead-allocation-policies",
          undefined,
          undefined,
          {
            schemaVersion: 1,
            id: "policy530",
            policyCode: "SHARED",
            versionNumber: 1,
            name: "Shared costs",
            method: "fixed_percentage",
            costClass: "fixed",
            effectiveFrom: "2026-01-01",
            configuration: {
              projectWeights: [
                { projectId: "p530a", weight: "1" },
                { projectId: "p530b", weight: "1" },
              ],
            },
            reason: "Initial policy",
          },
          maker,
          "policy-create",
        )
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await post(
          "overhead-allocation-policies",
          "policy530",
          "submit",
          { schemaVersion: 1, expectedResourceVersion: "1", reason: "Submit" },
          maker,
          "policy-submit",
        )
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await post(
          "overhead-allocation-policies",
          "policy530",
          "approve",
          { schemaVersion: 1, expectedResourceVersion: "2", reason: "Self" },
          maker,
          "policy-self",
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await post(
          "overhead-allocation-policies",
          "policy530",
          "approve",
          { schemaVersion: 1, expectedResourceVersion: "2", reason: "Approve" },
          checker,
          "policy-approve",
        )
      ).statusCode,
    ).toBe(201);
    const poolResponse = await post(
      "overhead-source-pools",
      undefined,
      undefined,
      {
        schemaVersion: 1,
        id: "pool530",
        policyId: "policy530",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        sourceCostItemIds: ["oh530"],
        reason: "August pool",
      },
      maker,
      "pool-create",
    );
    expect(poolResponse.statusCode, poolResponse.body).toBe(201);
    const duplicate = await post(
      "overhead-source-pools",
      undefined,
      undefined,
      {
        schemaVersion: 1,
        id: "pool530dup",
        policyId: "policy530",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        sourceCostItemIds: ["oh530"],
        reason: "Duplicate",
      },
      maker,
      "pool-duplicate",
    );
    expect(duplicate.statusCode).toBe(409);
    const run = await post(
      "overhead-allocation-runs",
      undefined,
      undefined,
      { schemaVersion: 1, id: "run530", poolId: "pool530", reason: "Allocate" },
      maker,
      "run-create",
    );
    expect(run.statusCode, run.body).toBe(201);
    expect(
      run.json().data.resource.splits.map((x: any) => [x.projectId, x.amountMinor, x.roundingRank]),
    ).toEqual([
      ["p530a", "51", 1],
      ["p530b", "50", 2],
    ]);
    let journalId = "",
      reversalJournalId = "";
    for (const [action, version, token] of [
      ["submit", "1", maker],
      ["approve", "2", checker],
      ["post", "3", checker],
      ["reverse", "4", checker],
    ] as const) {
      const response = await post(
        "overhead-allocation-runs",
        "run530",
        action,
        { schemaVersion: 1, expectedResourceVersion: version, reason: action },
        token,
        `run-${action}`,
      );
      expect(response.statusCode, response.body).toBe(201);
      if (action === "post") journalId = response.json().data.resource.journalId;
      if (action === "reverse") reversalJournalId = response.json().data.resource.reversalJournalId;
    }
    expect(journalId).toBeTruthy();
    expect(reversalJournalId).toBeTruthy();
    const balance = await pool.query<{ debit: string; credit: string }>(
      `select coalesce(sum(debit_minor),0)::text debit,coalesce(sum(credit_minor),0)::text credit from journal_lines where organization_id=$1 and journal_id=$2`,
      [org, journalId],
    );
    expect(balance.rows[0]).toEqual({ debit: "101", credit: "101" });
    const projectDebits = await pool.query<{ n: string }>(
      `select coalesce(sum(debit_minor),0)::text n from journal_lines where organization_id=$1 and journal_id=$2 and dimensions ? 'projectId'`,
      [org, journalId],
    );
    expect(projectDebits.rows[0]?.n).toBe("101");
    const reversal = await pool.query<{ reversal: string; state: string; net: string }>(
      `select r.reversal_of_id reversal,o.state,(select coalesce(sum(coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0)),0)::text from journal_lines l where l.organization_id=$1 and l.journal_id in($2,$3)) net from journal_entries r join journal_entries o on o.organization_id=r.organization_id and o.id=r.reversal_of_id where r.organization_id=$1 and r.id=$3`,
      [org, journalId, reversalJournalId],
    );
    expect(reversal.rows[0]).toEqual({ reversal: journalId, state: "reversed", net: "0" });
    const lockedPool = await post(
      "overhead-source-pools",
      undefined,
      undefined,
      {
        schemaVersion: 1,
        id: "pool530b",
        policyId: "policy530",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        sourceCostItemIds: ["oh530b"],
        reason: "Second pool",
      },
      maker,
      "pool-b-create",
    );
    expect(lockedPool.statusCode).toBe(201);
    const periodClient = await pool.connect();
    try {
      await periodClient.query("begin");
      await periodClient.query("select set_config('naai.period_transition_authorized','on',true)");
      await periodClient.query(
        `update fiscal_periods set state='hard_locked' where organization_id=$1 and fiscal_year=2026 and period_number=8`,
        [org],
      );
      await periodClient.query("commit");
    } finally {
      periodClient.release();
    }
    const lockedRun = await post(
      "overhead-allocation-runs",
      undefined,
      undefined,
      { schemaVersion: 1, id: "run530b", poolId: "pool530b", reason: "Locked" },
      maker,
      "run-b-create",
    );
    expect(lockedRun.statusCode).toBe(409);
  });
});
