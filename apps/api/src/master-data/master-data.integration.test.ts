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
  const approverToken = "approver-secret";

  beforeAll(async () => {
    await pool.query(`
      insert into organizations (id, legal_name, base_currency, timezone)
      values ('org-api-a', 'API A', 'VND', 'Asia/Ho_Chi_Minh'),
             ('org-api-b', 'API B', 'VND', 'Asia/Ho_Chi_Minh');
      insert into fiscal_years (organization_id,year,starts_on,ends_on)
      values ('org-api-a',2026,'2026-01-01','2026-12-31');
      insert into fiscal_periods
        (organization_id,fiscal_year,period_number,starts_on,ends_on)
      values ('org-api-a',2026,8,'2026-08-01','2026-08-31');
    `);
    await pool.query(
      `insert into api_credentials (organization_id,id,actor_id,token_hash,roles)
       values ('org-api-a','cred-1','ai-integration',$1,'["integration","finance_admin"]'),
              ('org-api-a','cred-2','human-approver',$2,'["approver","accountant"]')`,
      [
        createHash("sha256").update(token).digest("hex"),
        createHash("sha256").update(approverToken).digest("hex"),
      ],
    );
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  async function approve(journalId: string, key: string) {
    return app.inject({
      method: "POST",
      url: `/api/v1/organizations/org-api-a/journals/${journalId}/approve`,
      headers: {
        authorization: `Bearer ${approverToken}`,
        "idempotency-key": key,
      },
      payload: { reason: "Reviewed by independent approver" },
    });
  }

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

  it("stores accountant identity metadata with organization scope and database validation", async () => {
    const party = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-api-a/master-data/parties",
      headers: {
        authorization: `Bearer ${token}`,
        "idempotency-key": "accountant-party-metadata-create",
      },
      payload: {
        data: {
          id: "party-accountant-metadata",
          display_name: "NAAI Client",
          legal_name: "NAAI Client Company Limited",
          normalized_tax_id: "0312345678",
          registered_address: "1 Nguyen Hue, Ho Chi Minh City",
          email: "accounting@example.vn",
          phone: "+84 28 1234 5678",
          website: "https://example.vn",
          status: "active",
        },
      },
    });
    expect(party.statusCode, party.body).toBe(201);
    expect(party.json().data.resource).toMatchObject({
      legal_name: "NAAI Client Company Limited",
      registered_address: "1 Nguyen Hue, Ho Chi Minh City",
      email: "accounting@example.vn",
      phone: "+84 28 1234 5678",
      website: "https://example.vn",
    });

    const organizationKey = Buffer.from(JSON.stringify({ id: "org-api-a" })).toString("base64url");
    const organization = await app.inject({
      method: "PATCH",
      url: `/api/v1/organizations/org-api-a/master-data/organizations/${organizationKey}`,
      headers: {
        authorization: `Bearer ${token}`,
        "idempotency-key": "accountant-organization-metadata-update",
        "if-match": "1",
      },
      payload: {
        data: {
          tax_id: "0317654321",
          registered_address: "2 Le Loi, Ho Chi Minh City",
        },
      },
    });
    expect(organization.statusCode, organization.body).toBe(200);
    expect(organization.json().data.resource).toMatchObject({
      id: "org-api-a",
      tax_id: "0317654321",
      registered_address: "2 Le Loi, Ho Chi Minh City",
    });

    const invalid = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-api-a/master-data/parties",
      headers: {
        authorization: `Bearer ${token}`,
        "idempotency-key": "accountant-party-invalid-email",
      },
      payload: {
        data: {
          id: "party-invalid-email",
          display_name: "Invalid Email",
          email: "not-an-email",
          status: "active",
        },
      },
    });
    expect(invalid.statusCode).toBe(400);
    expect(
      (
        await pool.query(
          "select 1 from parties where organization_id=$1 and id='party-invalid-email'",
          ["org-api-a"],
        )
      ).rowCount,
    ).toBe(0);
  });

  it("manages purchase products with only 8% or 10% VAT through the versioned API", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-api-a/master-data/purchase-products",
      headers: {
        authorization: `Bearer ${token}`,
        "idempotency-key": "purchase-product-create-8",
      },
      payload: {
        data: { code: "HOSTING", name: "Dịch vụ hosting", vat_rate_percent: 8, is_active: true },
      },
    });
    expect(create.statusCode, create.body).toBe(201);
    expect(create.json().data.resource).toMatchObject({
      code: "HOSTING",
      vat_rate_percent: 8,
      is_active: true,
    });
    const invalid = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-api-a/master-data/purchase-products",
      headers: {
        authorization: `Bearer ${token}`,
        "idempotency-key": "purchase-product-create-5",
      },
      payload: { data: { code: "INVALID", name: "Sai thuế", vat_rate_percent: 5 } },
    });
    expect(invalid.statusCode).toBe(422);
    expect(invalid.json().error.code).toBe("PURCHASE_PRODUCT_VAT_RATE_INVALID");

    const key = Buffer.from(JSON.stringify({ code: "HOSTING" })).toString("base64url");
    const updated = await app.inject({
      method: "PATCH",
      url: `/api/v1/organizations/org-api-a/master-data/purchase-products/${key}`,
      headers: {
        authorization: `Bearer ${token}`,
        "idempotency-key": "purchase-product-update-10",
        "if-match": "1",
      },
      payload: { data: { vat_rate_percent: 10 } },
    });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json().data.resource.vat_rate_percent).toBe(10);
    const deactivated = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/org-api-a/master-data/purchase-products/${key}/deactivate`,
      headers: {
        authorization: `Bearer ${token}`,
        "idempotency-key": "purchase-product-deactivate",
      },
      payload: { data: {} },
    });
    expect(deactivated.statusCode, deactivated.body).toBe(201);
    expect(deactivated.json().data.resource.is_active).toBe(false);
    expect(
      (
        await pool.query(
          "select vat_rate_percent,is_active,version::text from purchase_products where organization_id='org-api-a' and code='HOSTING'",
        )
      ).rows[0],
    ).toEqual({ vat_rate_percent: 10, is_active: false, version: "3" });
  });

  it("deletes only an unreferenced project with version, reason, audit and idempotency", async () => {
    await pool.query(`
      insert into users(id,email,display_name) values
        ('project-delete-owner','project-delete-owner@example.test','Project delete owner')
      on conflict do nothing;
      insert into organization_memberships(organization_id,user_id) values
        ('org-api-a','project-delete-owner')
      on conflict do nothing;
      insert into parties(organization_id,id,display_name,status) values
        ('org-api-a','project-delete-client','Project delete client','active')
      on conflict do nothing;
      insert into projects
        (organization_id,id,code,name,client_party_id,owner_user_id,contract_type,currency,budget_minor,starts_on,state)
      values
        ('org-api-a','project-delete-free','DELETE-FREE','Unreferenced project','project-delete-client','project-delete-owner','fixed_fee','VND',0,'2026-01-01','planned'),
        ('org-api-a','project-delete-used','DELETE-USED','Referenced project','project-delete-client','project-delete-owner','fixed_fee','VND',0,'2026-01-01','planned')
      on conflict do nothing;
      insert into contracts(organization_id,id,project_id,reference,value_minor,currency)
      values ('org-api-a','project-delete-contract','project-delete-used','DELETE-CONTRACT',0,'VND')
      on conflict do nothing;
    `);
    const freeKey = Buffer.from(JSON.stringify({ id: "project-delete-free" })).toString(
      "base64url",
    );
    const usedKey = Buffer.from(JSON.stringify({ id: "project-delete-used" })).toString(
      "base64url",
    );
    const get = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/org-api-a/master-data/projects/${freeKey}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().data.resource_version).toBe("1");

    const missingPrecondition = await app.inject({
      method: "DELETE",
      url: `/api/v1/organizations/org-api-a/master-data/projects/${freeKey}`,
      headers: {
        authorization: `Bearer ${token}`,
        "idempotency-key": "project-delete-missing-version",
      },
      payload: { reason: "Duplicate import" },
    });
    expect(missingPrecondition.statusCode).toBe(428);

    const referenced = await app.inject({
      method: "DELETE",
      url: `/api/v1/organizations/org-api-a/master-data/projects/${usedKey}`,
      headers: {
        authorization: `Bearer ${token}`,
        "idempotency-key": "project-delete-referenced",
        "if-match": "1",
      },
      payload: { reason: "Duplicate import" },
    });
    expect(referenced.statusCode).toBe(409);
    expect(referenced.json().error.code).toBe("PROJECT_DELETE_REFERENCED");

    const request = {
      method: "DELETE" as const,
      url: `/api/v1/organizations/org-api-a/master-data/projects/${freeKey}`,
      headers: {
        authorization: `Bearer ${token}`,
        "idempotency-key": "project-delete-free",
        "if-match": "1",
      },
      payload: { reason: "Duplicate import" },
    };
    const deleted = await app.inject(request);
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().data.resource.deleted).toBe(true);
    expect(deleted.json().data.mutation.resourceVersion).toBe("2");
    const replay = await app.inject(request);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().data.mutation.idempotencyReplayed).toBe(true);
    const persisted = await pool.query(
      "select 1 from projects where organization_id=$1 and id=$2",
      ["org-api-a", "project-delete-free"],
    );
    expect(persisted.rowCount).toBe(0);
    const audit = await pool.query<{ action: string; before_state: Record<string, unknown> }>(
      "select action,before_state from resource_audit_events where organization_id=$1 and resource_type='projects' and resource_key=$2 order by occurred_at desc limit 1",
      ["org-api-a", freeKey],
    );
    expect(audit.rows[0]?.action).toBe("delete");
    expect(audit.rows[0]?.before_state.deletion_reason).toBe("Duplicate import");
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
    expect((await approve("journal-api-1", "journal-approve-1")).statusCode).toBe(201);
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
    expect(counts.rows[0]).toEqual({ journals: 1, events: 2 });
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
    expect((await approve("journal-api-2", "journal-approve-2")).statusCode).toBe(201);
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
      "select count(*)::int count from outbox_events where organization_id='org-api-a' and aggregate_id='journal-api-2' and event_type='journal.posted'",
    );
    expect(state.rows[0].state).toBe("approved");
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
    expect((await approve("journal-api-3", "journal-approve-3")).statusCode).toBe(201);
    const request = {
      method: "POST" as const,
      url: "/api/v1/organizations/org-api-a/journals/journal-api-3/post",
      headers: { authorization: `Bearer ${token}`, "idempotency-key": "journal-post-3" },
    };
    const responses = await Promise.all([app.inject(request), app.inject(request)]);
    expect(responses.map((response) => response.statusCode)).toEqual([201, 201]);
    expect(responses.filter((response) => response.json().data.idempotencyReplayed).length).toBe(1);
    const events = await pool.query(
      "select count(*)::int count from outbox_events where organization_id='org-api-a' and aggregate_id='journal-api-3' and event_type='journal.posted'",
    );
    expect(events.rows[0].count).toBe(1);
  });

  it("enforces maker-checker then reverses and creates one replacement draft", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-api-a/journals",
      headers: { authorization: `Bearer ${token}`, "idempotency-key": "workflow-create-1" },
      payload: {
        id: "workflow-journal-1",
        journalDate: "2026-08-05",
        description: "Workflow journal",
        currency: "VND",
        lines: [
          { accountCode: "111", debitMinor: "1000" },
          { accountCode: "411", creditMinor: "1000" },
        ],
      },
    });
    const selfApproval = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-api-a/journals/workflow-journal-1/approve",
      headers: { authorization: `Bearer ${token}`, "idempotency-key": "workflow-self-approve" },
      payload: { reason: "Self approve attempt" },
    });
    expect(selfApproval.statusCode).toBe(409);
    await pool.query(`insert into accounting_workflow_policies
      (organization_id,allow_self_approval,self_approval_max_minor,updated_by)
      values ('org-api-a',true,2000,'human-approver')`);
    await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-api-a/journals",
      headers: { authorization: `Bearer ${token}`, "idempotency-key": "small-create" },
      payload: {
        id: "workflow-small-1",
        journalDate: "2026-08-05",
        description: "Small-team exception",
        currency: "VND",
        lines: [
          { accountCode: "111", debitMinor: "500" },
          { accountCode: "411", creditMinor: "500" },
        ],
      },
    });
    const allowedSelfApproval = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-api-a/journals/workflow-small-1/approve",
      headers: { authorization: `Bearer ${token}`, "idempotency-key": "small-self-approve" },
      payload: { reason: "Configured small-team exception" },
    });
    expect(allowedSelfApproval.statusCode).toBe(201);
    expect(allowedSelfApproval.json().data.selfApproval).toBe(true);
    expect((await approve("workflow-journal-1", "workflow-approve")).statusCode).toBe(201);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/organizations/org-api-a/journals/workflow-journal-1/post",
          headers: { authorization: `Bearer ${token}`, "idempotency-key": "workflow-post" },
        })
      ).statusCode,
    ).toBe(201);
    const reverse = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-api-a/journals/workflow-journal-1/reverse",
      headers: { authorization: `Bearer ${approverToken}`, "idempotency-key": "workflow-reverse" },
      payload: {
        reason: "Correct account mapping",
        reversalDate: "2026-08-06",
        reversalJournalId: "workflow-reversal-1",
      },
    });
    expect(reverse.statusCode).toBe(201);
    expect(reverse.json().data.reversalJournalId).toBe("workflow-reversal-1");
    const repostRequest = {
      method: "POST" as const,
      url: "/api/v1/organizations/org-api-a/journals/workflow-journal-1/repost",
      headers: { authorization: `Bearer ${token}`, "idempotency-key": "workflow-repost" },
      payload: {
        id: "workflow-replacement-1",
        journalDate: "2026-08-06",
        description: "Corrected workflow journal",
        currency: "VND",
        lines: [
          { accountCode: "111", debitMinor: "1000" },
          { accountCode: "411", creditMinor: "1000" },
        ],
      },
    };
    const repost = await app.inject(repostRequest);
    expect(repost.statusCode).toBe(201);
    expect((await app.inject(repostRequest)).json().data.idempotencyReplayed).toBe(true);
    const rows = await pool.query(
      `select id,state,reversal_of_id,replacement_of_id from journal_entries
       where organization_id='org-api-a' and id like 'workflow-%' order by id`,
    );
    expect(rows.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "workflow-journal-1", state: "reversed" }),
        expect.objectContaining({
          id: "workflow-reversal-1",
          state: "posted",
          reversal_of_id: "workflow-journal-1",
        }),
        expect.objectContaining({
          id: "workflow-replacement-1",
          state: "draft",
          replacement_of_id: "workflow-journal-1",
        }),
      ]),
    );
    const net = await pool.query<{ account_code: string; net: string }>(
      `select account_code,(coalesce(sum(debit_minor),0)-coalesce(sum(credit_minor),0))::text net
       from journal_lines where organization_id='org-api-a'
         and journal_id in ('workflow-journal-1','workflow-reversal-1') group by account_code`,
    );
    expect(net.rows.every((row) => row.net === "0")).toBe(true);
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

  it("enforces soft and hard period locks and privileged audited reopen", async () => {
    const close = async (targetState: "soft_locked" | "hard_locked", key: string) =>
      app.inject({
        method: "POST",
        url: "/api/v1/organizations/org-api-a/fiscal-periods/close",
        headers: { authorization: `Bearer ${token}`, "idempotency-key": key },
        payload: {
          fiscalYear: 2026,
          periodNumber: 8,
          targetState,
          reason: `Close to ${targetState}`,
        },
      });
    expect((await close("soft_locked", "period-close-soft")).statusCode).toBe(201);

    await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-api-a/journals",
      headers: { authorization: `Bearer ${token}`, "idempotency-key": "soft-journal-create" },
      payload: {
        id: "soft-journal",
        journalDate: "2026-08-07",
        description: "Soft lock test",
        currency: "VND",
        lines: [
          { accountCode: "111", debitMinor: "100" },
          { accountCode: "411", creditMinor: "100" },
        ],
      },
    });
    expect((await approve("soft-journal", "soft-journal-approve")).statusCode).toBe(201);
    const accountantPost = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-api-a/journals/soft-journal/post",
      headers: {
        authorization: `Bearer ${approverToken}`,
        "idempotency-key": "soft-accountant-post",
      },
    });
    expect(accountantPost.statusCode).toBe(409);
    expect(accountantPost.json().error.code).toBe("PERIOD_SOFT_LOCKED");
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/organizations/org-api-a/journals/soft-journal/post",
          headers: { authorization: `Bearer ${token}`, "idempotency-key": "soft-finance-post" },
        })
      ).statusCode,
    ).toBe(201);

    expect((await close("hard_locked", "period-close-hard")).statusCode).toBe(201);
    await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-api-a/journals",
      headers: { authorization: `Bearer ${token}`, "idempotency-key": "hard-journal-create" },
      payload: {
        id: "hard-journal",
        journalDate: "2026-08-08",
        description: "Hard lock test",
        currency: "VND",
        lines: [
          { accountCode: "111", debitMinor: "100" },
          { accountCode: "411", creditMinor: "100" },
        ],
      },
    });
    expect((await approve("hard-journal", "hard-journal-approve")).statusCode).toBe(201);
    const hardPost = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-api-a/journals/hard-journal/post",
      headers: { authorization: `Bearer ${token}`, "idempotency-key": "hard-post" },
    });
    expect(hardPost.statusCode).toBe(409);
    expect(hardPost.json().error.code).toBe("PERIOD_HARD_LOCKED");
    const hardReverse = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-api-a/journals/soft-journal/reverse",
      headers: { authorization: `Bearer ${token}`, "idempotency-key": "hard-reverse" },
      payload: {
        reason: "Backdated correction attempt",
        reversalDate: "2026-08-09",
        reversalJournalId: "hard-reversal-denied",
      },
    });
    expect(hardReverse.statusCode).toBe(409);
    expect(hardReverse.json().error.code).toBe("PERIOD_HARD_LOCKED");

    const deniedReopen = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-api-a/fiscal-periods/reopen",
      headers: {
        authorization: `Bearer ${approverToken}`,
        "idempotency-key": "period-reopen-denied",
      },
      payload: { fiscalYear: 2026, periodNumber: 8, targetState: "soft_locked", reason: "Denied" },
    });
    expect(deniedReopen.statusCode).toBe(403);
    for (const [targetState, key] of [
      ["soft_locked", "period-reopen-soft"],
      ["open", "period-reopen-open"],
    ] as const) {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/organizations/org-api-a/fiscal-periods/reopen",
        headers: { authorization: `Bearer ${token}`, "idempotency-key": key },
        payload: {
          fiscalYear: 2026,
          periodNumber: 8,
          targetState,
          reason: `Approved reopen to ${targetState}`,
        },
      });
      expect(response.statusCode).toBe(201);
    }
    const state = await pool.query(
      "select state from fiscal_periods where organization_id='org-api-a' and fiscal_year=2026 and period_number=8",
    );
    const events = await pool.query(
      "select count(*)::int count from fiscal_period_events where organization_id='org-api-a' and fiscal_year=2026 and period_number=8",
    );
    expect(state.rows[0].state).toBe("open");
    expect(events.rows[0].count).toBe(4);
  });
});
