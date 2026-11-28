import {
  evaluatePaymentDeductibility,
  isPaymentMethod,
  isTransactionEvidence,
} from "@naai-erp/domain";
import type { PoolClient } from "pg";
import {
  lookupReconciledBankPayment,
  querySameDaySupplierGrossMinor,
  resolveNonCashThresholdMinor,
  resolveOwnerCurrentAccountCodes,
} from "../payment-evidence/payment-evidence-evaluator.js";
import {
  makeReason,
  type DraftRecordReasonItem,
  type DraftRecordingActorContext,
} from "./draft-recording.types.js";

export async function checkFiscalPeriodEligibility(
  client: PoolClient,
  context: DraftRecordingActorContext,
  dateValue: string,
  fieldName: string,
  reasons: DraftRecordReasonItem[],
): Promise<void> {
  const periodRes = await client.query<{ state: string }>(
    `select state::text from fiscal_periods
      where organization_id = $1 and $2::date between starts_on and ends_on`,
    [context.organizationId, dateValue],
  );
  if (periodRes.rows.length === 0) {
    reasons.push(makeReason("FISCAL_PERIOD_NOT_FOUND", fieldName));
  } else if (periodRes.rows.length > 1) {
    reasons.push(makeReason("FISCAL_PERIOD_AMBIGUOUS", fieldName));
  } else if (periodRes.rows[0]!.state === "hard_locked") {
    reasons.push(makeReason("PERIOD_HARD_LOCKED", fieldName));
  } else if (
    periodRes.rows[0]!.state === "soft_locked" &&
    !context.roles.some((role) => role === "owner" || role === "finance_admin")
  ) {
    reasons.push(makeReason("PERIOD_SOFT_LOCKED", fieldName));
  }
}

export async function isAccountActive(
  client: PoolClient,
  organizationId: string,
  accountCode: string,
): Promise<boolean> {
  const code = accountCode.trim();
  if (!code) return false;
  const acct = await client.query<{ is_active: boolean }>(
    `select is_active from accounts where organization_id = $1 and code = $2`,
    [organizationId, code],
  );
  return Boolean(acct.rows[0]?.is_active);
}

export async function checkExpensePaymentEvidenceGate(
  client: PoolClient,
  context: DraftRecordingActorContext,
  expense: {
    id: string;
    expense_date: string;
    gross_minor: string;
    funding_financial_account_id: string | null;
    payment_method: string;
    paid_on: string | null;
    payment_evidence_ref: string | null;
    transaction_evidence: string;
    payee_party_id: string | null;
  },
  lines: ReadonlyArray<{
    vat_minor: string;
    vat_account_code: string | null;
    funding_treatment: string | null;
    cit_state: string;
    vat_state: string;
    review_reference: string | null;
  }>,
  counterCode: string,
  requirePaymentEvidence: boolean | undefined,
  reasons: DraftRecordReasonItem[],
): Promise<void> {
  const thresholdMinor = await resolveNonCashThresholdMinor(client, context.organizationId);
  const ownerCodes = await resolveOwnerCurrentAccountCodes(
    client,
    context.organizationId,
    expense.expense_date,
  );
  const reconciled = await lookupReconciledBankPayment(
    client,
    context.organizationId,
    "expense",
    expense.id,
  );
  const sameDayGross = await querySameDaySupplierGrossMinor(
    client,
    context.organizationId,
    expense.payee_party_id,
    expense.expense_date,
    [{ sourceType: "expense", sourceId: expense.id }],
  );
  const isOwnerPaid =
    !expense.funding_financial_account_id &&
    (ownerCodes.has(counterCode) ||
      lines.some((line) => line.funding_treatment === "owner_paid_company_cost"));
  const reconciledPaidOn =
    reconciled.paidMinor >= BigInt(expense.gross_minor) ? reconciled.paidOn : null;
  const hasInputVat = lines.some(
    (line) => line.vat_account_code !== null && BigInt(line.vat_minor) > 0n,
  );
  const decision = evaluatePaymentDeductibility({
    grossMinor: BigInt(expense.gross_minor),
    hasInputVat,
    thresholdMinor,
    recordDate: expense.expense_date,
    paymentMethod: isPaymentMethod(expense.payment_method) ? expense.payment_method : "unpaid",
    paidOn: expense.paid_on,
    paymentEvidenceRef: expense.payment_evidence_ref,
    transactionEvidence: isTransactionEvidence(expense.transaction_evidence)
      ? expense.transaction_evidence
      : "none",
    isOwnerPaid,
    reconciledBankPaidOn: reconciledPaidOn,
    sameDaySupplierGrossMinor: sameDayGross,
  });
  const explicitShortcut = lines.some(
    (line) =>
      line.review_reference !== null &&
      line.review_reference !== "solopreneur_policy" &&
      ((decision.citGatedByPayment &&
        ["eligible", "partially_eligible"].includes(line.cit_state)) ||
        (decision.vatGatedByPayment &&
          ["eligible", "partially_eligible"].includes(line.vat_state))),
  );
  if (explicitShortcut || (requirePaymentEvidence && decision.paymentEvidenceMissing)) {
    reasons.push(makeReason("PAYMENT_EVIDENCE_REQUIRED", "paymentMethod"));
  }
}

export async function checkPurchaseDocumentPaymentEvidenceGate(
  client: PoolClient,
  context: DraftRecordingActorContext,
  document: {
    id: string;
    document_date: string;
    party_id: string;
    gross_minor: string;
    funding_financial_account_id: string | null;
    payment_method: string;
    paid_on: string | null;
    payment_evidence_ref: string | null;
    transaction_evidence: string;
  },
  lines: ReadonlyArray<{
    tax_minor: string;
    tax_account_code: string | null;
    cit_state: string;
    vat_state: string;
    review_reference: string | null;
  }>,
  effectiveControlCode: string,
  requirePaymentEvidence: boolean | undefined,
  reasons: DraftRecordReasonItem[],
): Promise<void> {
  const thresholdMinor = await resolveNonCashThresholdMinor(client, context.organizationId);
  const ownerCodes = await resolveOwnerCurrentAccountCodes(
    client,
    context.organizationId,
    document.document_date,
  );
  const reconciled = await lookupReconciledBankPayment(
    client,
    context.organizationId,
    "commercial_document",
    document.id,
  );
  const sameDayGross = await querySameDaySupplierGrossMinor(
    client,
    context.organizationId,
    document.party_id,
    document.document_date,
    [{ sourceType: "purchase_invoice", sourceId: document.id }],
  );
  const isOwnerPaid =
    !document.funding_financial_account_id && ownerCodes.has(effectiveControlCode);
  const reconciledPaidOn =
    reconciled.paidMinor >= BigInt(document.gross_minor) ? reconciled.paidOn : null;
  const hasInputVat = lines.some(
    (line) => line.tax_account_code !== null && BigInt(line.tax_minor) > 0n,
  );
  const decision = evaluatePaymentDeductibility({
    grossMinor: BigInt(document.gross_minor),
    hasInputVat,
    thresholdMinor,
    recordDate: document.document_date,
    paymentMethod: isPaymentMethod(document.payment_method) ? document.payment_method : "unpaid",
    paidOn: document.paid_on,
    paymentEvidenceRef: document.payment_evidence_ref,
    transactionEvidence: isTransactionEvidence(document.transaction_evidence)
      ? document.transaction_evidence
      : "none",
    isOwnerPaid,
    reconciledBankPaidOn: reconciledPaidOn,
    sameDaySupplierGrossMinor: sameDayGross,
  });
  const explicitShortcut = lines.some(
    (line) =>
      line.review_reference !== null &&
      line.review_reference !== "solopreneur_policy" &&
      ((decision.citGatedByPayment &&
        ["eligible", "partially_eligible"].includes(line.cit_state)) ||
        (decision.vatGatedByPayment &&
          ["eligible", "partially_eligible"].includes(line.vat_state))),
  );
  if (explicitShortcut || (requirePaymentEvidence && decision.paymentEvidenceMissing)) {
    reasons.push(makeReason("PAYMENT_EVIDENCE_REQUIRED", "paymentMethod"));
  }
}

export async function checkCreditNoteEligibility(
  client: PoolClient,
  organizationId: string,
  document: {
    id: string;
    party_id: string;
    currency: string;
    net_minor: string;
    tax_minor: string;
    original_document_id: string | null;
  },
  lines: ReadonlyArray<{ original_line_number: number | null }>,
  reasons: DraftRecordReasonItem[],
): Promise<void> {
  if (!document.original_document_id) {
    reasons.push(makeReason("CREDIT_ORIGINAL_INVALID", "originalDocumentId"));
    return;
  }
  const origRes = await client.query<{
    type: string;
    party_id: string;
    currency: string;
    net_minor: string;
    tax_minor: string;
    state: string;
  }>(
    `select type::text, party_id, currency, net_minor::text, tax_minor::text, state::text
       from commercial_documents
      where organization_id = $1 and id = $2
      for update`,
    [organizationId, document.original_document_id],
  );
  const orig = origRes.rows[0];
  if (
    !orig ||
    orig.type !== "sales_invoice" ||
    !["issued", "partially_paid", "paid"].includes(orig.state)
  ) {
    reasons.push(makeReason("CREDIT_ORIGINAL_INVALID", "originalDocumentId"));
    return;
  }
  if (orig.party_id !== document.party_id || orig.currency !== document.currency) {
    reasons.push(makeReason("CREDIT_ORIGINAL_MISMATCH", "originalDocumentId"));
  }
  const credited = await client.query<{ net: string; tax: string }>(
    `select coalesce(sum(net_minor), 0)::text as net, coalesce(sum(tax_minor), 0)::text as tax
       from commercial_documents
      where organization_id = $1 and type = 'credit_note'
        and original_document_id = $2 and state <> 'cancelled' and id <> $3`,
    [organizationId, document.original_document_id, document.id],
  );
  if (
    BigInt(credited.rows[0]!.net) + BigInt(document.net_minor) > BigInt(orig.net_minor) ||
    BigInt(credited.rows[0]!.tax) + BigInt(document.tax_minor) > BigInt(orig.tax_minor)
  ) {
    reasons.push(makeReason("CREDIT_EXCEEDS_REMAINING", "grossMinor"));
  }
  for (const line of lines) {
    if (!line.original_line_number) {
      reasons.push(makeReason("CREDIT_ORIGINAL_LINE_REQUIRED", "originalLineNumber"));
    }
  }
}

export function deduplicateReasons(
  reasons: readonly DraftRecordReasonItem[],
): DraftRecordReasonItem[] {
  const seen = new Set<string>();
  const out: DraftRecordReasonItem[] = [];
  for (const reason of reasons) {
    const key = `${reason.code}:${reason.field ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(reason);
  }
  return out;
}
