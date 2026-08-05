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
       values ('org-api-a','cred-1','ai-integration',$1,'["integration","finance_admin"]')`,
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

  it("creates and posts a balanced journal atomically with one outbox event", async () => {
    await pool.query(`
      insert into accounts (organization_id,code,name,root_type)
      values ('org-api-a','111','Bank','asset'),('org-api-a','411','Owner capital','equity')
      on conflict do nothing
    `);
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-api-a/journals",
      headers: { authorization: `Bearer ${token}`, "idempotency-key": "journal-create-1" },
      payload: {
        id: "journal-api-1",
        journalDate: "2026-08-05",
        description: "Capital contribution",
        currency: "VND",
        lines: [
          { accountCode: "111", debitMinor: "500000000" },
          { accountCode: "411", creditMinor: "500000000" },
        ],
      },
    });
    expect(create.statusCode).toBe(201);
    const request = {
      method: "POST" as const,
      url: "/api/v1/organizations/org-api-a/journals/journal-api-1/post",
      headers: { authorization: `Bearer ${token}`, "idempotency-key": "journal-post-1" },
    };
    const first = await app.inject(request);
    expect(first.statusCode).toBe(201);
    expect(first.json().data.state).toBe("posted");
    const replay = await app.inject(request);
    expect(replay.statusCode).toBe(201);
    expect(replay.json().data.idempotencyReplayed).toBe(true);
    const counts = await pool.query(`select
      (select count(*)::int from journal_entries where organization_id='org-api-a' and id='journal-api-1') journals,
      (select count(*)::int from outbox_events where organization_id='org-api-a' and aggregate_id='journal-api-1') events`);
    expect(counts.rows[0]).toEqual({ journals: 1, events: 1 });
  });

  it("rejects an unbalanced journal without posting or outbox effects", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-api-a/journals",
      headers: { authorization: `Bearer ${token}`, "idempotency-key": "journal-create-2" },
      payload: {
        id: "journal-api-2",
        journalDate: "2026-08-05",
        description: "Invalid journal",
        currency: "VND",
        lines: [
          { accountCode: "111", debitMinor: "100" },
          { accountCode: "411", creditMinor: "99" },
        ],
      },
    });
    const result = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-api-a/journals/journal-api-2/post",
      headers: { authorization: `Bearer ${token}`, "idempotency-key": "journal-post-2" },
    });
    expect(result.statusCode).toBe(422);
    const state = await pool.query(
      "select state from journal_entries where organization_id='org-api-a' and id='journal-api-2'",
    );
    const events = await pool.query(
      "select count(*)::int count from outbox_events where organization_id='org-api-a' and aggregate_id='journal-api-2'",
    );
    expect(state.rows[0].state).toBe("draft");
    expect(events.rows[0].count).toBe(0);
  });

  it("serializes concurrent posting retries into one effect", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-api-a/journals",
      headers: { authorization: `Bearer ${token}`, "idempotency-key": "journal-create-3" },
      payload: {
        id: "journal-api-3",
        journalDate: "2026-08-05",
        description: "Concurrent post",
        currency: "VND",
        lines: [
          { accountCode: "111", debitMinor: "100" },
          { accountCode: "411", creditMinor: "100" },
        ],
      },
    });
    const request = {
      method: "POST" as const,
      url: "/api/v1/organizations/org-api-a/journals/journal-api-3/post",
      headers: { authorization: `Bearer ${token}`, "idempotency-key": "journal-post-3" },
    };
    const responses = await Promise.all([app.inject(request), app.inject(request)]);
    expect(responses.map((response) => response.statusCode)).toEqual([201, 201]);
    expect(responses.filter((response) => response.json().data.idempotencyReplayed).length).toBe(1);
    const events = await pool.query(
      "select count(*)::int count from outbox_events where organization_id='org-api-a' and aggregate_id='journal-api-3'",
    );
    expect(events.rows[0].count).toBe(1);
  });

  it("evaluates effective posting rules without creating ledger effects", async () => {
    await pool.query(`insert into posting_rule_versions
      (organization_id,rule_id,version,name,document_type,effective_from,status,conditions,line_templates,change_reason,correlation_id,created_by)
      values ('org-api-a','expense-default',1,'Expense default','expense','2026-01-01','active',
        '{"categoryCode":"hosting","requiredDimensions":["project","client","cost_center","service_line","tax"]}',
        '[{"side":"debit","accountCode":"511"},{"side":"credit","accountCode":"111"}]',
        'Initial test rule','corr-rule-api','ai-integration')`);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-api-a/posting-rules/evaluate",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        journalId: "journal-eval-1",
        documentType: "expense",
        documentId: "expense-1",
        postingDate: "2026-08-05",
        baseCurrency: "VND",
        description: "Hosting",
        sourceLines: [
          {
            id: "line-1",
            amountMinor: "1000000",
            categoryCode: "hosting",
            taxCode: "VAT10",
            dimensions: {
              projectId: "p1",
              clientId: "c1",
              costCenterCode: "ops",
              serviceLineCode: "web",
              taxCode: "VAT10",
            },
          },
        ],
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().data.journal.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ debitMinor: "1000000", accountId: "511" }),
        expect.objectContaining({ creditMinor: "1000000", accountId: "111" }),
      ]),
    );
    expect(response.json().data.appliedRules).toEqual([
      { sourceLineId: "line-1", ruleId: "expense-default", ruleVersion: 1 },
    ]);
    const effects = await pool.query(
      "select count(*)::int count from journal_entries where organization_id='org-api-a' and id='journal-eval-1'",
    );
    expect(effects.rows[0].count).toBe(0);
  });
});
