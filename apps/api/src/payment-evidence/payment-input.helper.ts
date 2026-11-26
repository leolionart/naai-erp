import {
  normalizePaymentEvidenceInput,
  type PaymentEvidenceFields,
  type RawPaymentEvidenceInput,
} from "@naai-erp/domain";

export type StoredPaymentEvidenceColumns = Readonly<{
  payment_method?: string | null | undefined;
  paymentMethod?: string | null | undefined;
  paid_on?: Date | string | null | undefined;
  paidOn?: Date | string | null | undefined;
  payment_evidence_ref?: string | null | undefined;
  paymentEvidenceRef?: string | null | undefined;
  transaction_evidence?: string | null | undefined;
  transactionEvidence?: string | null | undefined;
}>;

function formatStoredDate(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function extractStoredPaymentEvidence(
  existing: StoredPaymentEvidenceColumns,
): PaymentEvidenceFields {
  return normalizePaymentEvidenceInput({
    paymentMethod: existing.paymentMethod ?? existing.payment_method ?? "unpaid",
    paidOn: formatStoredDate(existing.paidOn ?? existing.paid_on),
    paymentEvidenceRef: existing.paymentEvidenceRef ?? existing.payment_evidence_ref ?? null,
    transactionEvidence: existing.transactionEvidence ?? existing.transaction_evidence ?? "none",
  });
}

export function mergePaymentEvidenceFields(
  input: RawPaymentEvidenceInput,
  existing?: StoredPaymentEvidenceColumns,
): PaymentEvidenceFields {
  const defaults = existing ? extractStoredPaymentEvidence(existing) : undefined;
  return normalizePaymentEvidenceInput(input, defaults);
}
