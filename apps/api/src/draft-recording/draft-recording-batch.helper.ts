import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { recordCommercialDocumentOnClient } from "./commercial-document-record.helper.js";
import {
  makeReason,
  type BatchDraftRecordItemInput,
  type BatchDraftRecordItemResult,
  type DraftRecordKind,
  type DraftRecordingActorContext,
} from "./draft-recording.types.js";
import { recordExpenseOnClient } from "./expense-record.helper.js";

export const BATCH_RECORD_MAX_ITEMS = 200;

export function normalizeBatchItems(
  items: readonly BatchDraftRecordItemInput[],
): Array<{ kind: DraftRecordKind; id: string }> {
  const seen = new Set<string>();
  const normalized: Array<{ kind: DraftRecordKind; id: string }> = [];
  for (const item of items) {
    const rawKind = typeof item?.kind === "string" ? item.kind.trim() : "";
    const id = typeof item?.id === "string" ? item.id.trim() : "";
    if (!id) throw new Error("VALIDATION_FAILED");
    const kind: DraftRecordKind =
      rawKind === "expense"
        ? "expense"
        : [
              "commercial_document",
              "document",
              "purchase_invoice",
              "sales_invoice",
              "credit_note",
            ].includes(rawKind)
          ? "commercial_document"
          : (() => {
              throw new Error("VALIDATION_FAILED");
            })();
    const dedupKey = `${kind}:${id}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    normalized.push({ kind, id });
  }
  return normalized;
}

export async function discoverOrganizationDrafts(
  client: PoolClient,
  organizationId: string,
): Promise<Array<{ kind: DraftRecordKind; id: string }>> {
  const [expRes, docRes] = await Promise.all([
    client.query<{ id: string }>(
      `select id from expenses
        where organization_id = $1 and state = 'draft'
        order by expense_date asc, id asc
        limit $2`,
      [organizationId, BATCH_RECORD_MAX_ITEMS],
    ),
    client.query<{ id: string }>(
      `select id from commercial_documents
        where organization_id = $1 and state = 'draft'
        order by document_date asc, id asc
        limit $2`,
      [organizationId, BATCH_RECORD_MAX_ITEMS],
    ),
  ]);
  return [
    ...expRes.rows.map((row) => ({ kind: "expense" as const, id: row.id })),
    ...docRes.rows.map((row) => ({ kind: "commercial_document" as const, id: row.id })),
  ].slice(0, BATCH_RECORD_MAX_ITEMS);
}

export async function evaluateBatchDraftItemsOnClient(
  client: PoolClient,
  context: DraftRecordingActorContext,
  targets: ReadonlyArray<{ kind: DraftRecordKind; id: string }>,
  options: { isCommit: boolean; reason: string; requirePaymentEvidence: boolean },
) {
  const itemResults: BatchDraftRecordItemResult[] = [];
  const planFingerprintRows: Array<Record<string, unknown>> = [];

  for (const [idx, target] of targets.entries()) {
    const savepoint = `sp_draft_record_${idx}`;
    await client.query(`savepoint ${savepoint}`);
    try {
      if (target.kind === "expense") {
        const outcome = await recordExpenseOnClient(client, context, target.id, {
          reason: options.reason,
          requirePaymentEvidence: options.requirePaymentEvidence,
        });
        if (!outcome.found) {
          await client.query(`rollback to savepoint ${savepoint}`);
          const reasons = [makeReason("RESOURCE_NOT_FOUND", "id")];
          itemResults.push({
            kind: "expense",
            id: target.id,
            status: "blocked",
            eligible: false,
            resourceVersion: null,
            targetState: null,
            journalId: null,
            grossMinor: null,
            reasons,
          });
          planFingerprintRows.push({
            kind: "expense",
            id: target.id,
            initialVersion: null,
            eligible: false,
            reasonCodes: ["RESOURCE_NOT_FOUND"],
          });
        } else if (!outcome.ok) {
          await client.query(`rollback to savepoint ${savepoint}`);
          itemResults.push({
            kind: "expense",
            id: target.id,
            status: "blocked",
            eligible: false,
            resourceVersion: outcome.initialVersion,
            targetState: null,
            journalId: null,
            grossMinor: outcome.grossMinor,
            reasons: outcome.reasons,
          });
          planFingerprintRows.push({
            kind: "expense",
            id: target.id,
            initialVersion: outcome.initialVersion,
            eligible: false,
            grossMinor: outcome.grossMinor,
            reasonCodes: outcome.reasons.map((r) => r.code),
          });
        } else {
          itemResults.push({
            kind: "expense",
            id: target.id,
            status: options.isCommit ? "succeeded" : "ready",
            eligible: true,
            resourceVersion: options.isCommit
              ? outcome.data.resourceVersion
              : outcome.initialVersion,
            targetState: outcome.data.state,
            journalId: options.isCommit ? outcome.data.journalId : null,
            grossMinor: outcome.grossMinor,
            paymentEvidenceMissing: outcome.data.paymentEvidenceMissing,
            warnings: outcome.data.warnings,
            reasons: [],
          });
          planFingerprintRows.push({
            kind: "expense",
            id: target.id,
            initialVersion: outcome.initialVersion,
            eligible: true,
            targetState: outcome.data.state,
            grossMinor: outcome.grossMinor,
            reasonCodes: [],
          });
        }
      } else {
        const outcome = await recordCommercialDocumentOnClient(client, context, target.id, {
          reason: options.reason,
          requirePaymentEvidence: options.requirePaymentEvidence,
        });
        if (!outcome.found) {
          await client.query(`rollback to savepoint ${savepoint}`);
          const reasons = [makeReason("RESOURCE_NOT_FOUND", "id")];
          itemResults.push({
            kind: "commercial_document",
            id: target.id,
            status: "blocked",
            eligible: false,
            resourceVersion: null,
            targetState: null,
            journalId: null,
            grossMinor: null,
            reasons,
          });
          planFingerprintRows.push({
            kind: "commercial_document",
            id: target.id,
            initialVersion: null,
            eligible: false,
            reasonCodes: ["RESOURCE_NOT_FOUND"],
          });
        } else if (!outcome.ok) {
          await client.query(`rollback to savepoint ${savepoint}`);
          itemResults.push({
            kind: "commercial_document",
            id: target.id,
            documentType: outcome.type,
            status: "blocked",
            eligible: false,
            resourceVersion: outcome.initialVersion,
            targetState: null,
            journalId: null,
            grossMinor: outcome.grossMinor,
            reasons: outcome.reasons,
          });
          planFingerprintRows.push({
            kind: "commercial_document",
            id: target.id,
            initialVersion: outcome.initialVersion,
            eligible: false,
            grossMinor: outcome.grossMinor,
            reasonCodes: outcome.reasons.map((r) => r.code),
          });
        } else {
          itemResults.push({
            kind: "commercial_document",
            id: target.id,
            documentType: outcome.type,
            status: options.isCommit ? "succeeded" : "ready",
            eligible: true,
            resourceVersion: options.isCommit
              ? outcome.data.resourceVersion
              : outcome.initialVersion,
            targetState: outcome.data.state,
            journalId: options.isCommit ? outcome.data.journalId : null,
            grossMinor: outcome.grossMinor,
            paymentEvidenceMissing: outcome.data.paymentEvidenceMissing,
            warnings: outcome.data.warnings,
            reasons: [],
          });
          planFingerprintRows.push({
            kind: "commercial_document",
            id: target.id,
            initialVersion: outcome.initialVersion,
            eligible: true,
            targetState: outcome.data.state,
            grossMinor: outcome.grossMinor,
            reasonCodes: [],
          });
        }
      }
    } catch (unexpected) {
      await client.query(`rollback to savepoint ${savepoint}`);
      const code = unexpected instanceof Error ? unexpected.message : "INTERNAL_ERROR";
      const reasons = [makeReason(code)];
      itemResults.push({
        kind: target.kind,
        id: target.id,
        status: "blocked",
        eligible: false,
        resourceVersion: null,
        targetState: null,
        journalId: null,
        grossMinor: null,
        reasons,
      });
      planFingerprintRows.push({
        kind: target.kind,
        id: target.id,
        initialVersion: null,
        eligible: false,
        reasonCodes: [code],
      });
    }
  }

  const computedPlanHash = createHash("sha256")
    .update(
      JSON.stringify({
        organizationId: context.organizationId,
        reason: options.reason,
        requirePaymentEvidence: options.requirePaymentEvidence,
        items: planFingerprintRows,
      }),
    )
    .digest("hex");

  const succeeded = itemResults.filter((item) => item.eligible);
  const blocked = itemResults.filter((item) => !item.eligible);
  const counts = {
    total: itemResults.length,
    eligible: succeeded.length,
    succeeded: options.isCommit ? succeeded.length : 0,
    blocked: blocked.length,
  };

  return { itemResults, computedPlanHash, succeeded, blocked, counts };
}
