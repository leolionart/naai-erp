import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { CommercialDocumentType } from "../commercial-documents/commercial-document.types.js";
import { assertSalesContractCoverageQuery } from "../commercial-documents/document-store-assertions.helper.js";
import { queryOrganizationBaseCurrency } from "../common/base-currency-guard.js";
import { applySolopreneurPurchaseDocumentDefaults } from "../payment-evidence/payment-evidence-evaluator.js";
import {
  checkCreditNoteEligibility,
  checkFiscalPeriodEligibility,
  checkPurchaseDocumentPaymentEvidenceGate,
  deduplicateReasons,
  isAccountActive,
} from "./draft-recording-checks.helper.js";
import { postDocumentJournalOnClient } from "./draft-recording-journals.helper.js";
import {
  makeReason,
  type DraftRecordReasonItem,
  type DraftRecordingActorContext,
} from "./draft-recording.types.js";

const ELIGIBLE_STATES_BY_TYPE: Readonly<Record<CommercialDocumentType, ReadonlySet<string>>> = {
  purchase_invoice: new Set(["draft", "captured", "verified", "approved"]),
  sales_invoice: new Set(["draft", "validated"]),
  credit_note: new Set(["draft", "validated"]),
};

type LockedDocumentRow = {
  id: string;
  type: CommercialDocumentType;
  state: string;
  document_date: string;
  due_date: string;
  currency: string;
  party_id: string;
  document_number: string;
  net_minor: string;
  tax_minor: string;
  gross_minor: string;
  control_account_code: string;
  funding_financial_account_id: string | null;
  original_document_id: string | null;
  payment_method: string;
  paid_on: string | null;
  payment_evidence_ref: string | null;
  transaction_evidence: string;
  created_by: string;
  version: string;
};

export type DocumentRecordOutcome =
  | { found: false }
  | {
      found: true;
      ok: false;
      type: CommercialDocumentType;
      initialVersion: string;
      grossMinor: string;
      reasons: readonly DraftRecordReasonItem[];
    }
  | {
      found: true;
      ok: true;
      type: CommercialDocumentType;
      initialVersion: string;
      grossMinor: string;
      data: {
        documentId: string;
        kind: "commercial_document";
        type: CommercialDocumentType;
        state: "posted" | "paid" | "issued";
        resourceVersion: string;
        journalId: string;
        reason: string;
        selfApproved: boolean;
        externalReferenceUsedAsEvidence: boolean;
        paymentEvidenceMissing: boolean;
        warnings: readonly string[];
        eventId: string;
        auditEventId: string;
        outboxEventId: string;
        nextActions: readonly string[];
      };
    };

export async function recordCommercialDocumentOnClient(
  client: PoolClient,
  context: DraftRecordingActorContext,
  id: string,
  options: { reason: string; requirePaymentEvidence?: boolean; autoRecorded?: boolean },
): Promise<DocumentRecordOutcome> {
  const locked = await client.query<LockedDocumentRow>(
    `select id, type, state::text, document_date::text, due_date::text, currency,
            party_id, document_number, net_minor::text, tax_minor::text, gross_minor::text,
            control_account_code, funding_financial_account_id, original_document_id,
            payment_method, paid_on::text, payment_evidence_ref, transaction_evidence,
            created_by, version::text
       from commercial_documents
      where organization_id = $1 and id = $2
      for update`,
    [context.organizationId, id],
  );
  const document = locked.rows[0];
  if (!document) return { found: false };

  const reasons: DraftRecordReasonItem[] = [];
  if (!ELIGIBLE_STATES_BY_TYPE[document.type]?.has(document.state)) {
    reasons.push(makeReason("INVALID_DOCUMENT_TRANSITION", "state"));
  }

  const baseCurrency = await queryOrganizationBaseCurrency(client, context.organizationId);
  if (document.currency.trim().toUpperCase() !== baseCurrency.trim().toUpperCase()) {
    reasons.push(makeReason("FOREIGN_CURRENCY_NOT_SUPPORTED", "currency"));
  }

  await checkFiscalPeriodEligibility(
    client,
    context,
    document.document_date,
    "documentDate",
    reasons,
  );

  let effectiveControlCode = document.control_account_code?.trim() ?? "";
  if (document.type === "purchase_invoice" && document.funding_financial_account_id) {
    const funding = await client.query<{ ledger_account_code: string }>(
      `select ledger_account_code from financial_accounts
        where organization_id = $1 and id = $2 and currency = $3 and status = 'active'
        for update`,
      [context.organizationId, document.funding_financial_account_id, document.currency],
    );
    if (!funding.rows[0]) {
      reasons.push(
        makeReason("PURCHASE_FUNDING_ACCOUNT_NOT_AVAILABLE", "fundingFinancialAccountId"),
      );
    } else {
      effectiveControlCode = funding.rows[0].ledger_account_code;
    }
  }
  if (!(await isAccountActive(client, context.organizationId, effectiveControlCode))) {
    reasons.push(makeReason("CONTROL_ACCOUNT_MISSING", "controlAccountCode"));
  }

  if (document.type === "sales_invoice") {
    try {
      await assertSalesContractCoverageQuery(client, context.organizationId, document);
    } catch (error) {
      const code = error instanceof Error ? error.message : "SALES_INVOICE_PROJECT_INVALID";
      reasons.push(makeReason(code, "projectId"));
    }
  }

  const linesRes = await client.query<{
    line_number: number;
    original_line_number: number | null;
    description: string;
    net_minor: string;
    tax_minor: string;
    cit_state: string;
    vat_state: string;
    payment_evidence_missing: boolean;
    primary_account_code: string;
    tax_account_code: string | null;
    review_reference: string | null;
    dimensions: Record<string, string>;
  }>(
    `select line_number, original_line_number, description, net_minor::text, tax_minor::text,
            cit_state::text, vat_state::text, payment_evidence_missing,
            primary_account_code, tax_account_code, review_reference, dimensions
       from commercial_document_lines
      where organization_id = $1 and document_id = $2
      order by line_number
      for update`,
    [context.organizationId, id],
  );

  if (linesRes.rows.length === 0) {
    reasons.push(makeReason("DOCUMENT_LINES_MISSING", "lines"));
  }

  for (const line of linesRes.rows) {
    if (!(await isAccountActive(client, context.organizationId, line.primary_account_code ?? ""))) {
      reasons.push(makeReason("PRIMARY_ACCOUNT_MISSING", "primaryAccountCode"));
    }
    if (
      BigInt(line.tax_minor) > 0n &&
      !(await isAccountActive(client, context.organizationId, line.tax_account_code ?? ""))
    ) {
      reasons.push(makeReason("VAT_ACCOUNT_MISSING", "taxAccountCode"));
    }
    const allocRes = await client.query<{ amount_minor: string }>(
      `select amount_minor::text from commercial_document_allocations
        where organization_id = $1 and document_id = $2 and line_number = $3`,
      [context.organizationId, id, line.line_number],
    );
    const allocated = allocRes.rows.reduce((sum, row) => sum + BigInt(row.amount_minor), 0n);
    if (allocated !== BigInt(line.net_minor)) {
      reasons.push(makeReason("DOCUMENT_ALLOCATION_MISMATCH", "allocations"));
    }
  }

  if (document.type === "credit_note") {
    await checkCreditNoteEligibility(
      client,
      context.organizationId,
      document,
      linesRes.rows,
      reasons,
    );
  }

  const extRefRes = await client.query(
    `select 1 from external_references where organization_id = $1 and document_id = $2 limit 1`,
    [context.organizationId, id],
  );
  const externalReferenceUsedAsEvidence =
    document.type === "purchase_invoice" && (extRefRes.rowCount ?? 0) > 0;

  if (document.type === "purchase_invoice" && linesRes.rows.length > 0) {
    await checkPurchaseDocumentPaymentEvidenceGate(
      client,
      context,
      document,
      linesRes.rows,
      effectiveControlCode,
      options.requirePaymentEvidence,
      reasons,
    );
  }

  if (reasons.length > 0) {
    return {
      found: true,
      ok: false,
      type: document.type,
      initialVersion: document.version,
      grossMinor: document.gross_minor,
      reasons: deduplicateReasons(reasons),
    };
  }

  if (document.type === "purchase_invoice") {
    await applySolopreneurPurchaseDocumentDefaults(client, context, id, options.reason);
  }

  const refreshedLines = await client.query<{
    line_number: number;
    description: string;
    net_minor: string;
    tax_minor: string;
    vat_state: string;
    payment_evidence_missing: boolean;
    primary_account_code: string;
    tax_account_code: string | null;
    dimensions: Record<string, string>;
  }>(
    `select line_number, description, net_minor::text, tax_minor::text,
            vat_state::text, payment_evidence_missing, primary_account_code, tax_account_code, dimensions
       from commercial_document_lines
      where organization_id = $1 and document_id = $2
      order by line_number`,
    [context.organizationId, id],
  );

  const journalId = await postDocumentJournalOnClient(
    client,
    context,
    { ...document, control_account_code: effectiveControlCode },
    refreshedLines.rows,
    options.reason,
  );

  const finalState: "posted" | "paid" | "issued" =
    document.type === "purchase_invoice"
      ? document.funding_financial_account_id
        ? "paid"
        : "posted"
      : "issued";
  const resourceVersion = (BigInt(document.version) + 1n).toString();
  const paymentEvidenceMissing =
    document.type === "purchase_invoice" &&
    refreshedLines.rows.some((line) => line.payment_evidence_missing);

  await client.query(
    `update commercial_documents set
       state = $3, version = $4::bigint, updated_at = now(), control_account_code = $7, draft_reasons = '[]'::jsonb,
       approved_by = case when type = 'purchase_invoice' then $5 else approved_by end,
       approved_at = case when type = 'purchase_invoice' then now() else approved_at end,
       issued_or_posted_by = $5, issued_or_posted_at = now(), journal_id = $6
     where organization_id = $1 and id = $2`,
    [
      context.organizationId,
      id,
      finalState,
      resourceVersion,
      context.actorId,
      journalId,
      effectiveControlCode,
    ],
  );

  const eventId = randomUUID();
  const auditEventId = randomUUID();
  const outboxEventId = randomUUID();
  await client.query(
    `insert into commercial_document_events
       (organization_id, id, document_id, from_state, to_state, actor_id, reason, correlation_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      context.organizationId,
      eventId,
      id,
      document.state,
      finalState,
      context.actorId,
      options.reason,
      context.correlationId,
    ],
  );
  await client.query(
    `insert into resource_audit_events
       (organization_id, id, resource_type, resource_key, resource_version, action, actor_id, correlation_id, before_state, after_state)
     values ($1, $2, 'commercial_document', $3, $4, 'record', $5, $6, $7, $8)`,
    [
      context.organizationId,
      auditEventId,
      id,
      resourceVersion,
      context.actorId,
      context.correlationId,
      { state: document.state },
      {
        state: finalState,
        journalId,
        reason: options.reason,
        selfApproved: document.type === "purchase_invoice",
        autoRecorded: Boolean(options.autoRecorded),
        externalReferenceUsedAsEvidence,
      },
    ],
  );
  await client.query(
    `insert into outbox_events
       (organization_id, id, aggregate_type, aggregate_id, event_type, schema_version, payload, correlation_id)
     values ($1, $2, 'commercial_document', $3, $4, 1, $5, $6)`,
    [
      context.organizationId,
      outboxEventId,
      id,
      `${document.type}.${finalState}`,
      { documentId: id, type: document.type, state: finalState, journalId },
      context.correlationId,
    ],
  );

  return {
    found: true,
    ok: true,
    type: document.type,
    initialVersion: document.version,
    grossMinor: document.gross_minor,
    data: {
      documentId: id,
      kind: "commercial_document",
      type: document.type,
      state: finalState,
      resourceVersion,
      journalId,
      reason: options.reason,
      selfApproved: document.type === "purchase_invoice",
      externalReferenceUsedAsEvidence,
      paymentEvidenceMissing,
      warnings: paymentEvidenceMissing ? (["payment_evidence_missing"] as const) : [],
      eventId,
      auditEventId,
      outboxEventId,
      nextActions: [],
    },
  };
}
