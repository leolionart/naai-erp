export const PAYMENT_METHODS = ["cash", "bank_transfer", "card", "other", "unpaid"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const TRANSACTION_EVIDENCE_TYPES = [
  "contract",
  "purchase_order",
  "email",
  "acceptance",
  "quote",
  "none",
] as const;
export type TransactionEvidence = (typeof TRANSACTION_EVIDENCE_TYPES)[number];

export const DEFAULT_NON_CASH_THRESHOLD_MINOR = 5_000_000n;

export type PaymentEvidenceFields = Readonly<{
  paymentMethod: PaymentMethod;
  paidOn: string | null;
  paymentEvidenceRef: string | null;
  transactionEvidence: TransactionEvidence;
}>;

export type RawPaymentEvidenceInput = Readonly<{
  paymentMethod?: string | null | undefined;
  payment_method?: string | null | undefined;
  paidOn?: string | null | undefined;
  paid_on?: string | null | undefined;
  paymentEvidenceRef?: string | null | undefined;
  payment_evidence_ref?: string | null | undefined;
  transactionEvidence?: string | null | undefined;
  transaction_evidence?: string | null | undefined;
}>;

export type SameDaySupplierInvoiceSlice = Readonly<{
  sourceType: "expense" | "purchase_invoice";
  sourceId: string;
  partyId: string | null;
  date: string;
  grossMinor: bigint;
  paymentMethod: PaymentMethod;
  paidOn: string | null;
  paymentEvidenceRef: string | null;
  isOwnerPaid: boolean;
  isBankReconciled?: boolean | undefined;
}>;

export type PaymentDeductibilityDecision = Readonly<{
  effectivePaymentMethod: PaymentMethod;
  effectivePaidOn: string | null;
  qualifyingNonCash: boolean;
  exceedsCitThreshold: boolean;
  sameDaySupplierGrossMinor: bigint;
  exceedsVatThreshold: boolean;
  citGatedByPayment: boolean;
  vatGatedByPayment: boolean;
  paymentEvidenceMissing: boolean;
  gapReasons: readonly (
    | "non_cash_payment_required"
    | "same_day_supplier_vat_threshold"
    | "owner_paid_evidence_ref_missing"
    | "unpaid_pending_settlement"
    | "transaction_evidence_missing"
  )[];
}>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(value: string): string {
  if (!ISO_DATE.test(value)) throw new Error("VALIDATION_FAILED");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("VALIDATION_FAILED");
  }
  return value;
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHODS as readonly string[]).includes(value);
}

export function isTransactionEvidence(value: unknown): value is TransactionEvidence {
  return (
    typeof value === "string" && (TRANSACTION_EVIDENCE_TYPES as readonly string[]).includes(value)
  );
}

export function normalizePaymentEvidenceInput(
  raw: RawPaymentEvidenceInput = {},
  defaults?: Partial<PaymentEvidenceFields>,
): PaymentEvidenceFields {
  const rawMethod = raw.paymentMethod ?? raw.payment_method;
  const paymentMethod =
    rawMethod === undefined || rawMethod === null
      ? (defaults?.paymentMethod ?? "unpaid")
      : isPaymentMethod(rawMethod)
        ? rawMethod
        : (() => {
            throw new Error("VALIDATION_FAILED");
          })();

  const hasPaidOn =
    Object.prototype.hasOwnProperty.call(raw, "paidOn") ||
    Object.prototype.hasOwnProperty.call(raw, "paid_on");
  const rawPaidOn = raw.paidOn !== undefined ? raw.paidOn : raw.paid_on;
  const paidOn = hasPaidOn
    ? rawPaidOn === null || rawPaidOn === ""
      ? null
      : typeof rawPaidOn === "string"
        ? assertIsoDate(rawPaidOn.trim())
        : (() => {
            throw new Error("VALIDATION_FAILED");
          })()
    : paymentMethod === "unpaid"
      ? null
      : (defaults?.paidOn ?? null);

  if (paymentMethod === "unpaid" && paidOn !== null) {
    throw new Error("VALIDATION_FAILED");
  }

  const hasRef =
    Object.prototype.hasOwnProperty.call(raw, "paymentEvidenceRef") ||
    Object.prototype.hasOwnProperty.call(raw, "payment_evidence_ref");
  const rawRef =
    raw.paymentEvidenceRef !== undefined ? raw.paymentEvidenceRef : raw.payment_evidence_ref;
  const paymentEvidenceRef = hasRef
    ? rawRef === null
      ? null
      : typeof rawRef === "string"
        ? rawRef.trim() || null
        : (() => {
            throw new Error("VALIDATION_FAILED");
          })()
    : (defaults?.paymentEvidenceRef ?? null);

  const rawTxEvidence = raw.transactionEvidence ?? raw.transaction_evidence;
  const transactionEvidence =
    rawTxEvidence === undefined || rawTxEvidence === null
      ? (defaults?.transactionEvidence ?? "none")
      : isTransactionEvidence(rawTxEvidence)
        ? rawTxEvidence
        : (() => {
            throw new Error("VALIDATION_FAILED");
          })();

  return Object.freeze({
    paymentMethod,
    paidOn,
    paymentEvidenceRef,
    transactionEvidence,
  });
}

export function resolveEffectivePaymentState(input: {
  paymentMethod: PaymentMethod;
  paidOn: string | null;
  reconciledBankPaidOn?: string | null | undefined;
}): Readonly<{
  effectivePaymentMethod: PaymentMethod;
  effectivePaidOn: string | null;
  inferredFromReconciliation: boolean;
}> {
  if (input.reconciledBankPaidOn) {
    return Object.freeze({
      effectivePaymentMethod:
        input.paymentMethod === "card" ? ("card" as const) : ("bank_transfer" as const),
      effectivePaidOn: input.paidOn ?? input.reconciledBankPaidOn,
      inferredFromReconciliation: input.paymentMethod === "unpaid" || input.paidOn === null,
    });
  }
  return Object.freeze({
    effectivePaymentMethod: input.paymentMethod,
    effectivePaidOn: input.paidOn,
    inferredFromReconciliation: false,
  });
}

export function hasQualifyingNonCashPayment(input: {
  paymentMethod: PaymentMethod;
  isOwnerPaid: boolean;
  paymentEvidenceRef?: string | null | undefined;
  isBankReconciled?: boolean | undefined;
}): boolean {
  if (input.isBankReconciled) return true;
  if (input.paymentMethod !== "bank_transfer" && input.paymentMethod !== "card") return false;
  if (input.isOwnerPaid) return Boolean(input.paymentEvidenceRef?.trim());
  return true;
}

export function computeSameDaySupplierTotals(
  slices: readonly SameDaySupplierInvoiceSlice[],
): ReadonlyMap<string, bigint> {
  const totals = new Map<string, bigint>();
  for (const slice of slices) {
    if (slice.grossMinor < 0n) throw new Error("Invoice gross amount cannot be negative");
    if (!slice.partyId) continue;
    const key = `${slice.partyId}::${slice.date}`;
    totals.set(key, (totals.get(key) ?? 0n) + slice.grossMinor);
  }
  return totals;
}

export function evaluatePaymentDeductibility(input: {
  grossMinor: bigint;
  hasInputVat: boolean;
  thresholdMinor?: bigint | undefined;
  paymentMethod: PaymentMethod;
  paidOn: string | null;
  paymentEvidenceRef?: string | null | undefined;
  transactionEvidence?: TransactionEvidence | undefined;
  isOwnerPaid: boolean;
  reconciledBankPaidOn?: string | null | undefined;
  sameDaySupplierGrossMinor?: bigint | undefined;
}): PaymentDeductibilityDecision {
  const threshold = input.thresholdMinor ?? DEFAULT_NON_CASH_THRESHOLD_MINOR;
  if (threshold < 0n || input.grossMinor < 0n) throw new Error("VALIDATION_FAILED");
  const effective = resolveEffectivePaymentState({
    paymentMethod: input.paymentMethod,
    paidOn: input.paidOn,
    reconciledBankPaidOn: input.reconciledBankPaidOn,
  });
  const isBankReconciled = Boolean(input.reconciledBankPaidOn);
  const qualifyingNonCash = hasQualifyingNonCashPayment({
    paymentMethod: effective.effectivePaymentMethod,
    isOwnerPaid: input.isOwnerPaid,
    paymentEvidenceRef: input.paymentEvidenceRef,
    isBankReconciled,
  });

  const sameDayGross =
    input.sameDaySupplierGrossMinor !== undefined &&
    input.sameDaySupplierGrossMinor > input.grossMinor
      ? input.sameDaySupplierGrossMinor
      : input.grossMinor;

  const exceedsCitThreshold = threshold > 0n ? input.grossMinor >= threshold : true;
  const exceedsVatThreshold = threshold > 0n ? sameDayGross >= threshold : true;

  const citGatedByPayment = exceedsCitThreshold && !qualifyingNonCash;
  const vatGatedByPayment = input.hasInputVat && exceedsVatThreshold && !qualifyingNonCash;
  const paymentEvidenceMissing = citGatedByPayment || vatGatedByPayment;

  const gapReasons: PaymentDeductibilityDecision["gapReasons"][number][] = [];
  if (paymentEvidenceMissing) {
    if (effective.effectivePaymentMethod === "unpaid") {
      gapReasons.push("unpaid_pending_settlement");
    }
    if (
      input.isOwnerPaid &&
      (effective.effectivePaymentMethod === "bank_transfer" ||
        effective.effectivePaymentMethod === "card") &&
      !input.paymentEvidenceRef?.trim()
    ) {
      gapReasons.push("owner_paid_evidence_ref_missing");
    } else {
      gapReasons.push("non_cash_payment_required");
    }
    if (!exceedsCitThreshold && exceedsVatThreshold && input.hasInputVat) {
      gapReasons.push("same_day_supplier_vat_threshold");
    }
    if ((input.transactionEvidence ?? "none") === "none") {
      gapReasons.push("transaction_evidence_missing");
    }
  }

  return Object.freeze({
    effectivePaymentMethod: effective.effectivePaymentMethod,
    effectivePaidOn: effective.effectivePaidOn,
    qualifyingNonCash,
    exceedsCitThreshold,
    sameDaySupplierGrossMinor: sameDayGross,
    exceedsVatThreshold,
    citGatedByPayment,
    vatGatedByPayment,
    paymentEvidenceMissing,
    gapReasons: Object.freeze(gapReasons),
  });
}
