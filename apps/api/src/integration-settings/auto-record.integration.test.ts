import { createHmac, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";
import {
  authHeaders,
  buildDraftExpenseInput,
  buildDraftPurchaseDocumentInput,
  buildDraftSalesDocumentInput,
  seedDraftRecordingTestOrg,
} from "../draft-recording/draft-recording.test-helper.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

function signWebhookPayload(secret: string, timestamp: string, payload: unknown) {
  const raw = JSON.stringify(payload);
  const sig = createHmac("sha256", secret).update(`${timestamp}.`).update(raw).digest("hex");
  return { raw, signature: `sha256=${sig}` };
}

describeIntegration(
  "ERP-990 T-INT-REC-003 integration source autoRecord flag and visible draft reasons",
  () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const organizationId = `org-rec990-${randomUUID().slice(0, 10)}`;
    const webhookSecretEnv = `ERP990_WH_SECRET_${organizationId.replaceAll("-", "_")}`;
    const webhookSecret = "erp990-webhook-signing-secret";
    const tokens = {
      owner: `owner-${organizationId}`,
      integration: `int-${organizationId}`,
      accountant: `acct-${organizationId}`,
    };
    let app: Awaited<ReturnType<typeof createApp>>;
    let webhookPublicId = "";
    let webhookSourceId = "";

    beforeAll(async () => {
      process.env[webhookSecretEnv] = webhookSecret;
      await seedDraftRecordingTestOrg(pool, organizationId, tokens);
      app = await createApp();
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
    });

    afterAll(async () => {
      delete process.env[webhookSecretEnv];
      await app?.close();
      await pool.end();
    });

    it("T-INT-REC-003a defaults autoRecord=false, configures API credentials and webhook sources safely without leaking secrets, and keeps items draft when autoRecord=false", async () => {
      // Integration actor cannot read or mutate integration settings
      const forbiddenGet = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${organizationId}/integration-sources`,
        headers: authHeaders(tokens.integration),
      });
      expect(forbiddenGet.statusCode).toBe(403);

      // Accountant can read overview (no token_hash exposed)
      const listInitial = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${organizationId}/integration-sources`,
        headers: authHeaders(tokens.accountant),
      });
      expect(listInitial.statusCode, listInitial.body).toBe(200);
      const initialData = listInitial.json().data;
      expect(initialData.operatingMode).toBe("solopreneur");
      expect(JSON.stringify(initialData)).not.toContain("token_hash");
      expect(JSON.stringify(initialData)).not.toContain("tokenHash");
      const intCred = initialData.apiCredentials.find((c: { id: string }) => c.id === "cred-int");
      expect(intCred).toMatchObject({
        id: "cred-int",
        actorId: "n8n-bot",
        autoRecord: false,
        isOwnerCredential: false,
      });

      // Accountant cannot mutate integration settings (403)
      const acctPatch = await app.inject({
        method: "PATCH",
        url: `/api/v1/organizations/${organizationId}/api-credentials/cred-int`,
        headers: authHeaders(tokens.accountant, "acct-patch-forbidden"),
        payload: { autoRecord: true },
      });
      expect(acctPatch.statusCode).toBe(403);

      // Owner creates an inbound webhook source (defaults autoRecord=false)
      webhookPublicId = `pub-${organizationId}`;
      const createWebhook = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/integration-sources`,
        headers: authHeaders(tokens.owner, "wh-create-1"),
        payload: {
          publicId: webhookPublicId,
          name: "Paperless OCR Webhook",
          actorId: "paperless-bot",
          secretRef: webhookSecretEnv,
        },
      });
      expect(createWebhook.statusCode, createWebhook.body).toBe(201);
      webhookSourceId = createWebhook.json().data.source.id;
      expect(createWebhook.json().data.source.autoRecord).toBe(false);

      // With autoRecord=false, integration token creates a valid expense -> stays draft
      const draftExp = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/expenses`,
        headers: authHeaders(tokens.integration, "exp-disabled-1"),
        payload: buildDraftExpenseInput({
          id: "exp-disabled-ok",
          date: "2026-08-05",
          netMinor: "1500000",
          vatMinor: "150000",
          grossMinor: "1650000",
          paymentMethod: "cash",
          paidOn: "2026-08-05",
        }),
      });
      expect(draftExp.statusCode, draftExp.body).toBe(201);
      expect(draftExp.json().data.state).toBe("draft");
      expect(draftExp.json().data.journalId).toBeNull();
    });

    it("T-INT-REC-003b auto-records eligible expenses and commercial documents on API token and inbound webhook ingestion under integration identity in solopreneur mode", async () => {
      // Enable autoRecord=true on cred-int and webhook source (with optimistic concurrency + idempotency)
      const enableCred = await app.inject({
        method: "PATCH",
        url: `/api/v1/organizations/${organizationId}/api-credentials/cred-int`,
        headers: authHeaders(tokens.owner, "enable-cred-int", "1"),
        payload: { name: "n8n Automation", autoRecord: true, reason: "Enable n8n auto-record" },
      });
      expect(enableCred.statusCode, enableCred.body).toBe(200);
      expect(enableCred.json().data.credential.autoRecord).toBe(true);
      expect(enableCred.json().data.credential.version).toBe("2");

      const enableWebhook = await app.inject({
        method: "PATCH",
        url: `/api/v1/organizations/${organizationId}/integration-sources/${webhookSourceId}`,
        headers: authHeaders(tokens.owner, "enable-wh-1", "1"),
        payload: { autoRecord: true, reason: "Enable Paperless auto-record" },
      });
      expect(enableWebhook.statusCode, enableWebhook.body).toBe(200);
      expect(enableWebhook.json().data.source.autoRecord).toBe(true);

      // 1. Integration token ingests an eligible invoice_backed expense (< 5M VND, externalReference as evidence)
      const autoExp = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/expenses`,
        headers: authHeaders(tokens.integration, "auto-exp-1"),
        payload: buildDraftExpenseInput({
          id: "exp-auto-posted",
          date: "2026-08-06",
          netMinor: "2000000",
          vatMinor: "200000",
          grossMinor: "2200000",
          paymentMethod: "cash",
          paidOn: "2026-08-06",
        }),
      });
      expect(autoExp.statusCode, autoExp.body).toBe(201);
      const autoExpData = autoExp.json().data;
      expect(autoExpData.state).toBe("posted");
      expect(autoExpData.autoRecorded).toBe(true);
      expect(autoExpData.reasons).toEqual([]);
      expect(autoExpData.journalId).toBeTruthy();

      // Idempotent replay returns identical posted response without duplicate journal
      const autoExpReplay = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/expenses`,
        headers: authHeaders(tokens.integration, "auto-exp-1"),
        payload: buildDraftExpenseInput({
          id: "exp-auto-posted",
          date: "2026-08-06",
          netMinor: "2000000",
          vatMinor: "200000",
          grossMinor: "2200000",
          paymentMethod: "cash",
          paidOn: "2026-08-06",
        }),
      });
      expect(autoExpReplay.statusCode).toBe(201);
      expect(autoExpReplay.json().data.idempotencyReplayed).toBe(true);
      expect(autoExpReplay.json().data.journalId).toBe(autoExpData.journalId);

      // Verify balanced journal, audit under integration actor ('n8n-bot'), and no duplicate outbox draft event
      const expJournal = await pool.query<{
        debit: string;
        credit: string;
        posted_by: string;
      }>(
        `select coalesce(sum(l.debit_minor), 0)::text as debit,
                coalesce(sum(l.credit_minor), 0)::text as credit,
                max(j.posted_by) as posted_by
           from journal_entries j
           join journal_lines l on l.organization_id = j.organization_id and l.journal_id = j.id
          where j.organization_id = $1 and j.id = $2`,
        [organizationId, autoExpData.journalId],
      );
      expect(expJournal.rows[0]).toEqual({
        debit: "2200000",
        credit: "2200000",
        posted_by: "n8n-bot",
      });

      const expAudit = await pool.query<{ action: string; actor_id: string }>(
        `select action, actor_id from resource_audit_events
          where organization_id = $1 and resource_type = 'expense' and resource_key = 'exp-auto-posted'
          order by occurred_at asc`,
        [organizationId],
      );
      expect(expAudit.rows).toEqual([
        { action: "record", actor_id: "n8n-bot" },
        { action: "create", actor_id: "n8n-bot" },
      ]);

      const expOutbox = await pool.query<{ event_type: string }>(
        `select event_type from outbox_events
          where organization_id = $1 and aggregate_type = 'expense' and aggregate_id = 'exp-auto-posted'`,
        [organizationId],
      );
      expect(expOutbox.rows).toEqual([{ event_type: "expense.posted" }]);

      // 2. Integration token ingests an eligible sales invoice -> auto-issued
      const autoSales = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/commercial-documents`,
        headers: authHeaders(tokens.integration, "auto-sales-1"),
        payload: buildDraftSalesDocumentInput({
          id: "doc-auto-sales",
          documentNumber: "SI-990-01",
          date: "2026-08-07",
          netMinor: "10000000",
          taxMinor: "1000000",
          grossMinor: "11000000",
        }),
      });
      expect(autoSales.statusCode, autoSales.body).toBe(201);
      expect(autoSales.json().data).toMatchObject({
        documentId: "doc-auto-sales",
        state: "issued",
        autoRecorded: true,
        reasons: [],
      });
      expect(autoSales.json().data.journalId).toBeTruthy();

      // 3. Inbound webhook source (autoRecord=true) ingests an eligible purchase invoice -> auto-paid
      const ts = String(Math.floor(Date.now() / 1000));
      const whPayload = {
        schemaVersion: 1,
        eventType: "purchase_invoice.create",
        externalId: "wh-pi-990-01",
        occurredAt: "2026-08-08T10:00:00Z",
        data: buildDraftPurchaseDocumentInput({
          id: "doc-wh-auto-pi",
          documentNumber: "PI-990-01",
          date: "2026-08-08",
          netMinor: "3000000",
          taxMinor: "300000",
          grossMinor: "3300000",
          fundingAccountId: "FA-BANK",
        }),
      };
      const signed = signWebhookPayload(webhookSecret, ts, whPayload);
      const whRes = await app.inject({
        method: "POST",
        url: `/api/v1/inbound/${webhookPublicId}/events`,
        headers: {
          "content-type": "application/json",
          "x-naai-timestamp": ts,
          "x-naai-signature": signed.signature,
          "idempotency-key": "wh-idem-pi-1",
        },
        payload: signed.raw,
      });
      expect(whRes.statusCode, whRes.body).toBe(201);
      const whInner = whRes.json().data.result.data;
      expect(whInner).toMatchObject({
        documentId: "doc-wh-auto-pi",
        state: "paid",
        autoRecorded: true,
        reasons: [],
      });
      expect(whInner.journalId).toBeTruthy();

      const whAudit = await pool.query<{ actor_id: string }>(
        `select actor_id from resource_audit_events
          where organization_id = $1 and resource_type = 'commercial_document'
            and resource_key = 'doc-wh-auto-pi' and action = 'record'`,
        [organizationId],
      );
      expect(whAudit.rows[0]?.actor_id).toBe("paperless-bot");
    });

    it("T-INT-REC-003c keeps ineligible ingested items in draft with visible structured reasons in API & list/detail reads, clears reasons once recorded, and respects controlled mode", async () => {
      // 1. Integration token ingests an ineligible expense (hard-locked period 2026-07 + missing evidence)
      const blockedExp = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/expenses`,
        headers: authHeaders(tokens.integration, "blocked-exp-1"),
        payload: buildDraftExpenseInput({
          id: "exp-auto-blocked",
          date: "2026-07-15",
          netMinor: "1200000",
          vatMinor: "120000",
          grossMinor: "1320000",
          withExternalReference: false,
        }),
      });
      expect(blockedExp.statusCode, blockedExp.body).toBe(201);
      const blockedExpData = blockedExp.json().data;
      expect(blockedExpData.state).toBe("draft");
      expect(blockedExpData.autoRecorded).toBe(false);
      expect(blockedExpData.journalId).toBeNull();
      const reasonCodes = (blockedExpData.reasons as Array<{ code: string }>).map((r) => r.code);
      expect(reasonCodes).toEqual(
        expect.arrayContaining(["PERIOD_HARD_LOCKED", "EXPENSE_EVIDENCE_INCOMPLETE"]),
      );

      // Verify GET /expenses/:id and GET /expenses expose visible structured reasons for UI
      const getBlockedExp = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${organizationId}/expenses/exp-auto-blocked`,
        headers: authHeaders(tokens.owner),
      });
      expect(getBlockedExp.statusCode).toBe(200);
      expect(
        (getBlockedExp.json().data.reasons as Array<{ code: string }>).map((r) => r.code),
      ).toEqual(expect.arrayContaining(["PERIOD_HARD_LOCKED", "EXPENSE_EVIDENCE_INCOMPLETE"]));

      const listExp = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${organizationId}/expenses?state=draft`,
        headers: authHeaders(tokens.owner),
      });
      expect(listExp.statusCode).toBe(200);
      const listedBlocked = (listExp.json().data.items as Array<Record<string, unknown>>).find(
        (item) => item.id === "exp-auto-blocked",
      );
      expect(
        ((listedBlocked?.reasons ?? []) as Array<{ code: string }>).map((r) => r.code),
      ).toEqual(expect.arrayContaining(["PERIOD_HARD_LOCKED", "EXPENSE_EVIDENCE_INCOMPLETE"]));

      // 2. Inbound webhook ingests a purchase invoice in hard-locked period 2026-07 -> stays draft with visible reasons
      const ts = String(Math.floor(Date.now() / 1000));
      const lockedPiPayload = {
        schemaVersion: 1,
        eventType: "purchase_invoice.create",
        externalId: "wh-pi-blocked-01",
        occurredAt: "2026-07-20T10:00:00Z",
        data: buildDraftPurchaseDocumentInput({
          id: "doc-wh-blocked-pi",
          documentNumber: "PI-990-BLK",
          date: "2026-07-20",
          netMinor: "5000000",
          taxMinor: "500000",
          grossMinor: "5500000",
          fundingAccountId: "FA-BANK",
        }),
      };
      const signedPi = signWebhookPayload(webhookSecret, ts, lockedPiPayload);
      const whBlocked = await app.inject({
        method: "POST",
        url: `/api/v1/inbound/${webhookPublicId}/events`,
        headers: {
          "content-type": "application/json",
          "x-naai-timestamp": ts,
          "x-naai-signature": signedPi.signature,
          "idempotency-key": "wh-idem-pi-blocked",
        },
        payload: signedPi.raw,
      });
      expect(whBlocked.statusCode, whBlocked.body).toBe(201);
      expect(whBlocked.json().data.state).toBe("processed");
      expect(whBlocked.json().data.result.data.state).toBe("draft");
      expect(whBlocked.json().data.result.data.autoRecorded).toBe(false);
      expect(
        (whBlocked.json().data.result.data.reasons as Array<{ code: string }>).map((r) => r.code),
      ).toContain("PERIOD_HARD_LOCKED");

      // Owner reads GET /commercial-documents/:id -> sees visible PERIOD_HARD_LOCKED reason, edits date to open period, and records -> reasons cleared!
      const getBlockedDoc = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${organizationId}/commercial-documents/doc-wh-blocked-pi`,
        headers: authHeaders(tokens.owner),
      });
      expect(getBlockedDoc.statusCode).toBe(200);
      expect(
        (getBlockedDoc.json().data.reasons as Array<{ code: string }>).map((r) => r.code),
      ).toContain("PERIOD_HARD_LOCKED");

      const patchDoc = await app.inject({
        method: "PATCH",
        url: `/api/v1/organizations/${organizationId}/commercial-documents/doc-wh-blocked-pi`,
        headers: authHeaders(
          tokens.owner,
          "owner-fix-blocked-pi",
          String(getBlockedDoc.json().data.version),
        ),
        payload: {
          documentDate: "2026-08-20",
          dueDate: "2026-08-20",
        },
      });
      expect(patchDoc.statusCode, patchDoc.body).toBe(200);

      const recDoc = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/commercial-documents/doc-wh-blocked-pi/record`,
        headers: authHeaders(tokens.owner, "owner-rec-fixed-pi"),
        payload: {},
      });
      expect(recDoc.statusCode, recDoc.body).toBe(200);
      expect(recDoc.json().data.state).toBe("paid");

      const rereadDoc = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${organizationId}/commercial-documents/doc-wh-blocked-pi`,
        headers: authHeaders(tokens.owner),
      });
      expect(rereadDoc.json().data.state).toBe("paid");
      expect(rereadDoc.json().data.reasons).toEqual([]);

      // 3. Switch organization to controlled mode -> autoRecord=true does NOT bypass maker-checker
      await pool.query(
        `update accounting_workflow_policies set operating_mode = 'controlled' where organization_id = $1`,
        [organizationId],
      );
      const controlledExp = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/expenses`,
        headers: authHeaders(tokens.integration, "controlled-exp-1"),
        payload: buildDraftExpenseInput({
          id: "exp-controlled-draft",
          date: "2026-08-12",
          netMinor: "1800000",
          vatMinor: "180000",
          grossMinor: "1980000",
          paymentMethod: "cash",
          paidOn: "2026-08-12",
        }),
      });
      expect(controlledExp.statusCode, controlledExp.body).toBe(201);
      expect(controlledExp.json().data.state).toBe("draft");
      expect(controlledExp.json().data.journalId).toBeNull();
    });
  },
);
