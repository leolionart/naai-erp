import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";
import {
  authHeaders,
  buildDraftExpenseInput,
  buildDraftPurchaseDocumentInput,
  buildDraftSalesDocumentInput,
  seedDraftRecordingTestOrg,
} from "./draft-recording.test-helper.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration(
  "ERP-989 T-INT-REC-001 & T-INT-REC-002 one-click and batch draft recording",
  () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const organizationId = `org-rec989-${randomUUID().slice(0, 10)}`;
    const tokens = {
      owner: `owner-${organizationId}`,
      integration: `int-${organizationId}`,
      accountant: `acct-${organizationId}`,
    };
    let app: Awaited<ReturnType<typeof createApp>>;

    beforeAll(async () => {
      await seedDraftRecordingTestOrg(pool, organizationId, tokens);
      app = await createApp();
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
    });

    afterAll(async () => {
      await app?.close();
      await pool.end();
    });

    it("T-INT-REC-001 atomically records draft expenses and commercial documents with default reason, tax/payment defaults, external evidence, idempotency, and complete multi-reason rollback", async () => {
      // 1. Integration creates an invoice_backed draft expense (< 5M VND, with externalReference only)
      const createExp = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/expenses`,
        headers: authHeaders(tokens.integration, "rec-exp-create-1"),
        payload: buildDraftExpenseInput({
          id: "exp-rec-ok",
          date: "2026-08-05",
          netMinor: "2000000",
          vatMinor: "200000",
          grossMinor: "2200000",
          paymentMethod: "cash",
          paidOn: "2026-08-05",
        }),
      });
      expect(createExp.statusCode, createExp.body).toBe(201);
      expect(createExp.json().data.state).toBe("draft");

      // Non-owner is forbidden from one-click recording
      const intAttempt = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/expenses/exp-rec-ok/record`,
        headers: authHeaders(tokens.integration, "rec-exp-int-forbidden"),
        payload: {},
      });
      expect(intAttempt.statusCode).toBe(403);

      // Owner records in one atomic transaction with default reason "Chủ ghi sổ"
      const recExp = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/expenses/exp-rec-ok/record`,
        headers: authHeaders(tokens.owner, "rec-exp-owner-1"),
        payload: {},
      });
      expect(recExp.statusCode, recExp.body).toBe(200);
      const recExpData = recExp.json().data;
      expect(recExpData.state).toBe("posted");
      expect(recExpData.reason).toBe("Chủ ghi sổ");
      expect(recExpData.externalReferenceUsedAsEvidence).toBe(true);
      expect(recExpData.paymentEvidenceMissing).toBe(false);
      expect(recExpData.journalId).toBeTruthy();

      // Replay with same idempotency key returns identical journalId without creating another journal
      const recExpReplay = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/expenses/exp-rec-ok/record`,
        headers: authHeaders(tokens.owner, "rec-exp-owner-1"),
        payload: {},
      });
      expect(recExpReplay.statusCode).toBe(200);
      expect(recExpReplay.json().data.idempotencyReplayed).toBe(true);
      expect(recExpReplay.json().data.journalId).toBe(recExpData.journalId);

      // Verify balanced journal and tax defaults in DB
      const journalSums = await pool.query<{ debit: string; credit: string }>(
        `select coalesce(sum(debit_minor), 0)::text as debit,
                coalesce(sum(credit_minor), 0)::text as credit
           from journal_lines
          where organization_id = $1 and journal_id = $2`,
        [organizationId, recExpData.journalId],
      );
      expect(journalSums.rows[0]).toEqual({ debit: "2200000", credit: "2200000" });

      const expDetail = (
        await app.inject({
          method: "GET",
          url: `/api/v1/organizations/${organizationId}/expenses/exp-rec-ok`,
          headers: authHeaders(tokens.owner),
        })
      ).json().data;
      expect(expDetail.cit_state).toBe("eligible");
      expect(expDetail.vat_state).toBe("eligible");

      // 2. Draft expense with MULTIPLE blockers (hard-locked period + inactive counter account + missing externalReference)
      //    rolls back completely and returns EVERY structured reason
      await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/expenses`,
        headers: authHeaders(tokens.integration, "rec-exp-bad-create"),
        payload: buildDraftExpenseInput({
          id: "exp-rec-blocked",
          date: "2026-07-15", // period 7 is hard_locked
          netMinor: "1000000",
          vatMinor: "100000",
          grossMinor: "1100000",
          counterAccountCode: "3389-INACTIVE", // inactive & not owner_current
          withExternalReference: false, // missing invoice evidence
        }),
      });

      const blockedRes = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/expenses/exp-rec-blocked/record`,
        headers: authHeaders(tokens.owner, "rec-exp-blocked-1"),
        payload: {},
      });
      expect(blockedRes.statusCode, blockedRes.body).toBe(422);
      const blockedBody = blockedRes.json();
      expect(blockedBody.error.code).toBe("DRAFT_RECORD_BLOCKED");
      const reasonCodes = (blockedBody.reasons as Array<{ code: string }>).map((r) => r.code);
      expect(reasonCodes).toEqual(
        expect.arrayContaining([
          "PERIOD_HARD_LOCKED",
          "COUNTER_ACCOUNT_MISSING",
          "OWNER_CURRENT_ACCOUNT_REQUIRED",
          "EXPENSE_EVIDENCE_INCOMPLETE",
        ]),
      );

      // Verify zero partial mutation on exp-rec-blocked
      const untouchedExp = await pool.query<{
        state: string;
        version: string;
        journal_id: string | null;
      }>(
        `select state::text, version::text, journal_id from expenses where organization_id = $1 and id = 'exp-rec-blocked'`,
        [organizationId],
      );
      expect(untouchedExp.rows[0]).toEqual({
        state: "draft",
        version: "1",
        journal_id: null,
      });

      // 3. ERP-982 >= 5M VND cash expense: blocked when requirePaymentEvidence=true, posts with withheld tax when false
      await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/expenses`,
        headers: authHeaders(tokens.integration, "rec-exp-5m-create"),
        payload: buildDraftExpenseInput({
          id: "exp-rec-5m-cash",
          date: "2026-08-10",
          netMinor: "5000000",
          vatMinor: "500000",
          grossMinor: "5500000",
          counterAccountCode: "3388-OWNER",
          paymentMethod: "cash",
          paidOn: "2026-08-10",
        }),
      });

      const gatedStrict = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/expenses/exp-rec-5m-cash/record`,
        headers: authHeaders(tokens.owner, "rec-exp-5m-strict"),
        payload: { requirePaymentEvidence: true },
      });
      expect(gatedStrict.statusCode).toBe(422);
      expect((gatedStrict.json().reasons as Array<{ code: string }>).map((r) => r.code)).toContain(
        "PAYMENT_EVIDENCE_REQUIRED",
      );

      const gatedDefault = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/expenses/exp-rec-5m-cash/record`,
        headers: authHeaders(tokens.owner, "rec-exp-5m-default"),
        payload: { reason: "Chủ ghi sổ chi phí tiền mặt trên 5tr" },
      });
      expect(gatedDefault.statusCode, gatedDefault.body).toBe(200);
      expect(gatedDefault.json().data.state).toBe("posted");
      expect(gatedDefault.json().data.paymentEvidenceMissing).toBe(true);
      expect(gatedDefault.json().data.warnings).toContain("payment_evidence_missing");

      // 4. One-click commercial document recording (purchase_invoice -> paid via bank, sales_invoice -> issued)
      await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/commercial-documents`,
        headers: authHeaders(tokens.integration, "rec-doc-pur-create"),
        payload: buildDraftPurchaseDocumentInput({
          id: "doc-pur-rec",
          documentNumber: "PI-REC-01",
          date: "2026-08-11",
          netMinor: "3000000",
          taxMinor: "300000",
          grossMinor: "3300000",
          controlAccountCode: "112-BANK",
          fundingAccountId: "FA-BANK",
        }),
      });
      const recPur = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/commercial-documents/doc-pur-rec/record`,
        headers: authHeaders(tokens.owner, "rec-doc-pur-1"),
        payload: {},
      });
      expect(recPur.statusCode, recPur.body).toBe(200);
      expect(recPur.json().data.state).toBe("paid");
      expect(recPur.json().data.journalId).toBeTruthy();

      await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/commercial-documents`,
        headers: authHeaders(tokens.integration, "rec-doc-sales-create"),
        payload: buildDraftSalesDocumentInput({
          id: "doc-sales-rec",
          documentNumber: "SI-REC-01",
          date: "2026-08-12",
          netMinor: "10000000",
          taxMinor: "1000000",
          grossMinor: "11000000",
        }),
      });
      const recSales = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/commercial-documents/doc-sales-rec/record`,
        headers: authHeaders(tokens.owner, "rec-doc-sales-1"),
        payload: {},
      });
      expect(recSales.statusCode, recSales.body).toBe(200);
      expect(recSales.json().data.state).toBe("issued");
      expect(recSales.json().data.journalId).toBeTruthy();

      // 5. BR-REC-003: ledger-changing actions (void/reverse, reclassify-funding, reclassify-accounts) STILL require explicit reason
      const voidWithoutReason = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/expenses/exp-rec-ok/reverse`,
        headers: authHeaders(tokens.owner, "void-no-reason", "2"),
        payload: { reason: "   " },
      });
      expect(voidWithoutReason.statusCode).toBe(400);

      const reclassifyWithoutReason = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/expenses/exp-rec-ok/reclassify-funding`,
        headers: authHeaders(tokens.owner, "reclass-no-reason", "2"),
        payload: { financialAccountId: "FA-CASH", reason: "" },
      });
      expect(reclassifyWithoutReason.statusCode).toBe(400);
    });

    it("T-INT-REC-002 dry-runs and commits batch draft recording via planHash with per-item succeeded and blocked results", async () => {
      await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/expenses`,
        headers: authHeaders(tokens.integration, "batch-exp-1-create"),
        payload: buildDraftExpenseInput({
          id: "batch-exp-1",
          date: "2026-08-15",
          netMinor: "1500000",
          vatMinor: "150000",
          grossMinor: "1650000",
        }),
      });
      await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/commercial-documents`,
        headers: authHeaders(tokens.integration, "batch-doc-1-create"),
        payload: buildDraftPurchaseDocumentInput({
          id: "batch-doc-1",
          documentNumber: "PI-BATCH-01",
          date: "2026-08-16",
          netMinor: "2500000",
          taxMinor: "250000",
          grossMinor: "2750000",
        }),
      });
      await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/expenses`,
        headers: authHeaders(tokens.integration, "batch-exp-locked-create"),
        payload: buildDraftExpenseInput({
          id: "batch-exp-locked",
          date: "2026-07-20", // hard_locked period
          netMinor: "800000",
          vatMinor: "0",
          grossMinor: "800000",
        }),
      });

      const batchItems = [
        { kind: "expense", id: "batch-exp-1" },
        { kind: "commercial_document", id: "batch-doc-1" },
        { kind: "expense", id: "batch-exp-locked" },
      ] as const;

      // 1. Dry-run performs zero mutations and computes deterministic planHash
      const dryRes = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/drafts/record`,
        headers: authHeaders(tokens.owner),
        payload: { dryRun: true, items: batchItems },
      });
      expect(dryRes.statusCode, dryRes.body).toBe(200);
      const dryData = dryRes.json().data;
      expect(dryData.dryRun).toBe(true);
      expect(dryData.committed).toBe(false);
      expect(dryData.planHash).toMatch(/^[a-f0-9]{64}$/);
      expect(dryData.counts).toEqual({
        total: 3,
        eligible: 2,
        succeeded: 0,
        blocked: 1,
      });
      expect(dryData.blocked[0].id).toBe("batch-exp-locked");
      expect(dryData.blocked[0].reasons.map((r: { code: string }) => r.code)).toContain(
        "PERIOD_HARD_LOCKED",
      );

      // Verify dry-run mutated nothing
      const afterDryStates = await pool.query<{ id: string; state: string }>(
        `select id, state::text from expenses where organization_id = $1 and id in ('batch-exp-1', 'batch-exp-locked') order by id`,
        [organizationId],
      );
      expect(afterDryStates.rows).toEqual([
        { id: "batch-exp-1", state: "draft" },
        { id: "batch-exp-locked", state: "draft" },
      ]);

      // 2. Mismatched planHash is rejected with 409 DRAFT_RECORD_PLAN_MISMATCH
      const mismatchRes = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/drafts/record`,
        headers: authHeaders(tokens.owner, "batch-commit-mismatch"),
        payload: {
          commit: true,
          planHash: "0".repeat(64),
          items: batchItems,
        },
      });
      expect(mismatchRes.statusCode).toBe(409);
      expect(mismatchRes.json().error.code).toBe("DRAFT_RECORD_PLAN_MISMATCH");

      // 3. Commit with matching planHash records eligible items and leaves blocked item in draft
      const commitRes = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/drafts/record`,
        headers: authHeaders(tokens.owner, "batch-commit-ok"),
        payload: {
          dryRun: false,
          commit: true,
          planHash: dryData.planHash,
          items: batchItems,
        },
      });
      expect(commitRes.statusCode, commitRes.body).toBe(200);
      const commitData = commitRes.json().data;
      expect(commitData.committed).toBe(true);
      expect(commitData.counts).toEqual({
        total: 3,
        eligible: 2,
        succeeded: 2,
        blocked: 1,
      });
      expect(
        commitData.succeeded.every((item: { journalId: string }) => Boolean(item.journalId)),
      ).toBe(true);
      expect(commitData.blocked[0].id).toBe("batch-exp-locked");

      // Replay commit returns identical result
      const commitReplay = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/drafts/record`,
        headers: authHeaders(tokens.owner, "batch-commit-ok"),
        payload: {
          dryRun: false,
          commit: true,
          planHash: dryData.planHash,
          items: batchItems,
        },
      });
      expect(commitReplay.statusCode).toBe(200);
      expect(commitReplay.json().data.idempotencyReplayed).toBe(true);

      // Controlled mode rejects batch recording
      await app.inject({
        method: "PATCH",
        url: `/api/v1/organizations/${organizationId}/organization-workflow-policy`,
        headers: authHeaders(tokens.owner, "switch-to-controlled"),
        payload: { operatingMode: "controlled" },
      });
      const controlledAttempt = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${organizationId}/drafts/record`,
        headers: authHeaders(tokens.owner),
        payload: { dryRun: true, items: [{ kind: "expense", id: "batch-exp-locked" }] },
      });
      expect(controlledAttempt.statusCode).toBe(409);
      expect(controlledAttempt.json().error.code).toBe("SOLOPRENEUR_POLICY_REQUIRED");
    });
  },
);
