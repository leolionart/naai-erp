export const VAT_RECONCILIATION_FORMULA_VERSION = "vat-reconciliation-v1" as const;
export const TAX_EXPENSE_REVIEW_FORMULA_VERSION = "tax-expense-review-v1" as const;

export type TaxEligibilityReviewState =
  "eligible" | "partially_eligible" | "ineligible" | "unreviewed" | "accountant_override";
export type TaxReportStatus = "ready" | "review_required";

export type VatSourceItem = Readonly<{
  id: string;
  sourceId: string;
  sourceType: "sales_invoice" | "sales_credit_note" | "purchase_invoice" | "expense";
  taxKind: "output" | "input";
  taxMinor: bigint;
  direction: "normal" | "reversal";
  reviewState?: TaxEligibilityReviewState;
  eligibleMinor?: bigint;
  reviewerId?: string;
  reviewReason?: string;
  reviewReferenceId?: string;
  taxCode?: string;
  taxCodeApproved: boolean;
  postedToLedger: boolean;
  journalId?: string;
  requiredEvidenceTypes: readonly string[];
  presentEvidenceTypes: readonly string[];
}>;

export type VatReconciliationPolicy = Readonly<{
  id: string;
  version: number;
  maxLedgerDifferenceMinor: bigint;
  maxUnreviewedInputMinor: bigint;
  maxUnresolvedItemCount: number;
  maxMissingEvidenceCount: number;
}>;

export type VatReconciliation = Readonly<{
  organizationId: string;
  currency: string;
  startsOn: string;
  endsOn: string;
  formulaVersion: typeof VAT_RECONCILIATION_FORMULA_VERSION;
  policyId: string;
  policyVersion: number;
  status: TaxReportStatus;
  outputVatMinor: bigint;
  inputVatMinor: bigint;
  eligibleInputVatMinor: bigint;
  ineligibleInputVatMinor: bigint;
  unreviewedInputVatMinor: bigint;
  netVatPayableMinor: bigint;
  outputVatLedgerMinor: bigint;
  inputVatLedgerMinor: bigint;
  outputDifferenceMinor: bigint;
  inputDifferenceMinor: bigint;
  missingEvidenceItemIds: readonly string[];
  unreconciledItemIds: readonly string[];
  invalidTaxCodeItemIds: readonly string[];
  unreviewedItemIds: readonly string[];
  sourceIds: readonly string[];
  journalIds: readonly string[];
  confidenceFlags: readonly Readonly<{
    code:
      | "vat_ledger_difference"
      | "vat_missing_evidence"
      | "vat_unreconciled_source"
      | "vat_tax_code_invalid"
      | "vat_input_unreviewed";
    severity: "warning" | "critical";
    amountMinor?: bigint;
    itemIds: readonly string[];
  }>[];
}>;

export type TaxExpenseReviewItem = Readonly<{
  id: string;
  sourceId: string;
  accountingBookedMinor: bigint;
  citBasisMinor: bigint;
  citReviewState: TaxEligibilityReviewState;
  citEligibleMinor?: bigint;
  vatBasisMinor: bigint;
  vatReviewState: TaxEligibilityReviewState;
  vatEligibleMinor?: bigint;
  reviewerId?: string;
  reviewReason?: string;
  reviewReferenceId?: string;
  requiredEvidenceTypes: readonly string[];
  presentEvidenceTypes: readonly string[];
}>;

export type TaxExpenseReview = Readonly<{
  organizationId: string;
  currency: string;
  startsOn: string;
  endsOn: string;
  formulaVersion: typeof TAX_EXPENSE_REVIEW_FORMULA_VERSION;
  status: TaxReportStatus;
  accountingBookedMinor: bigint;
  citBasisMinor: bigint;
  citEligibleMinor: bigint;
  citIneligibleMinor: bigint;
  citUnreviewedMinor: bigint;
  vatBasisMinor: bigint;
  vatEligibleMinor: bigint;
  vatIneligibleMinor: bigint;
  vatUnreviewedMinor: bigint;
  missingEvidenceItemIds: readonly string[];
  unreviewedItemIds: readonly string[];
  sourceIds: readonly string[];
  confidenceFlags: readonly Readonly<{
    code: "tax_expense_missing_evidence" | "tax_expense_unreviewed";
    severity: "warning" | "critical";
    itemIds: readonly string[];
  }>[];
}>;

const required = (value: string, label: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
};
const isoDate = (value: string, label: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must be an ISO date`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value)
    throw new Error(`${label} must be an ISO date`);
  return value;
};
const currency = (value: string) => {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("Tax report currency must be ISO-4217");
  return normalized;
};
const unique = (values: readonly string[]) =>
  Object.freeze([...new Set(values.map((value) => required(value, "Tax source ID")))].sort());
const missingEvidence = (requiredTypes: readonly string[], presentTypes: readonly string[]) => {
  const present = new Set(presentTypes);
  return requiredTypes.some((type) => !present.has(type));
};
const normalizeEligibility = (
  amount: bigint,
  state: TaxEligibilityReviewState,
  eligibleMinor: bigint | undefined,
  review: Pick<VatSourceItem, "reviewerId" | "reviewReason" | "reviewReferenceId">,
) => {
  if (amount < 0n) throw new Error("Tax basis amount cannot be negative");
  if (state === "unreviewed") {
    if (eligibleMinor !== undefined)
      throw new Error("Unreviewed tax item cannot have eligible amount");
    return { eligible: 0n, ineligible: 0n, unreviewed: amount };
  }
  let eligible: bigint;
  if (state === "eligible") eligible = amount;
  else if (state === "ineligible") eligible = 0n;
  else {
    if (eligibleMinor === undefined || eligibleMinor < 0n || eligibleMinor > amount)
      throw new Error("Partial or override tax review requires bounded eligible amount");
    eligible = eligibleMinor;
  }
  if (state === "accountant_override") {
    required(review.reviewerId ?? "", "Tax override reviewer");
    required(review.reviewReason ?? "", "Tax override reason");
    required(review.reviewReferenceId ?? "", "Tax override reference");
  }
  return { eligible, ineligible: amount - eligible, unreviewed: 0n };
};

export function buildVatReconciliation(
  input: Readonly<{
    organizationId: string;
    currency: string;
    startsOn: string;
    endsOn: string;
    policy: VatReconciliationPolicy;
    outputVatLedgerMinor: bigint;
    inputVatLedgerMinor: bigint;
    items: readonly VatSourceItem[];
  }>,
): VatReconciliation {
  const organizationId = required(input.organizationId, "VAT organization ID");
  const startsOn = isoDate(input.startsOn, "VAT start date"),
    endsOn = isoDate(input.endsOn, "VAT end date");
  if (startsOn > endsOn) throw new Error("VAT period is invalid");
  const policy = input.policy;
  required(policy.id, "VAT policy ID");
  if (!Number.isSafeInteger(policy.version) || policy.version < 1)
    throw new Error("VAT policy version is invalid");
  if (
    policy.maxLedgerDifferenceMinor < 0n ||
    policy.maxUnreviewedInputMinor < 0n ||
    !Number.isSafeInteger(policy.maxUnresolvedItemCount) ||
    policy.maxUnresolvedItemCount < 0 ||
    !Number.isSafeInteger(policy.maxMissingEvidenceCount) ||
    policy.maxMissingEvidenceCount < 0
  )
    throw new Error("VAT policy thresholds are invalid");
  let outputVatMinor = 0n,
    inputVatMinor = 0n,
    eligibleInputVatMinor = 0n,
    ineligibleInputVatMinor = 0n,
    unreviewedInputVatMinor = 0n;
  const missingEvidenceItemIds: string[] = [],
    unreconciledItemIds: string[] = [],
    invalidTaxCodeItemIds: string[] = [],
    unreviewedItemIds: string[] = [],
    sourceIds: string[] = [],
    journalIds: string[] = [];
  for (const item of input.items) {
    required(item.id, "VAT item ID");
    sourceIds.push(required(item.sourceId, "VAT source ID"));
    if (item.taxMinor < 0n) throw new Error("VAT item amount cannot be negative");
    const sign = item.direction === "reversal" ? -1n : 1n;
    if (!item.taxCode || !item.taxCodeApproved) invalidTaxCodeItemIds.push(item.id);
    if (missingEvidence(item.requiredEvidenceTypes, item.presentEvidenceTypes))
      missingEvidenceItemIds.push(item.id);
    if (!item.postedToLedger || !item.journalId) unreconciledItemIds.push(item.id);
    else journalIds.push(item.journalId);
    if (item.taxKind === "output") {
      if (item.reviewState || item.eligibleMinor !== undefined)
        throw new Error("Output VAT item cannot carry input eligibility review");
      outputVatMinor += sign * item.taxMinor;
      continue;
    }
    if (!item.reviewState) throw new Error("Input VAT item requires review state");
    const split = normalizeEligibility(item.taxMinor, item.reviewState, item.eligibleMinor, item);
    inputVatMinor += sign * item.taxMinor;
    eligibleInputVatMinor += sign * split.eligible;
    ineligibleInputVatMinor += sign * split.ineligible;
    unreviewedInputVatMinor += sign * split.unreviewed;
    if (item.reviewState === "unreviewed") unreviewedItemIds.push(item.id);
  }
  const outputDifferenceMinor = outputVatMinor - input.outputVatLedgerMinor,
    inputDifferenceMinor = inputVatMinor - input.inputVatLedgerMinor,
    netVatPayableMinor = outputVatMinor - eligibleInputVatMinor;
  const confidenceFlags: VatReconciliation["confidenceFlags"][number][] = [];
  if (outputDifferenceMinor !== 0n || inputDifferenceMinor !== 0n)
    confidenceFlags.push({
      code: "vat_ledger_difference",
      severity: "critical",
      amountMinor:
        (outputDifferenceMinor < 0n ? -outputDifferenceMinor : outputDifferenceMinor) +
        (inputDifferenceMinor < 0n ? -inputDifferenceMinor : inputDifferenceMinor),
      itemIds: unique(unreconciledItemIds),
    });
  if (missingEvidenceItemIds.length)
    confidenceFlags.push({
      code: "vat_missing_evidence",
      severity: "critical",
      itemIds: unique(missingEvidenceItemIds),
    });
  if (unreconciledItemIds.length)
    confidenceFlags.push({
      code: "vat_unreconciled_source",
      severity: "critical",
      itemIds: unique(unreconciledItemIds),
    });
  if (invalidTaxCodeItemIds.length)
    confidenceFlags.push({
      code: "vat_tax_code_invalid",
      severity: "critical",
      itemIds: unique(invalidTaxCodeItemIds),
    });
  if (unreviewedItemIds.length)
    confidenceFlags.push({
      code: "vat_input_unreviewed",
      severity: "warning",
      amountMinor: unreviewedInputVatMinor,
      itemIds: unique(unreviewedItemIds),
    });
  const abs = (value: bigint) => (value < 0n ? -value : value);
  const unresolved = new Set([
    ...missingEvidenceItemIds,
    ...unreconciledItemIds,
    ...invalidTaxCodeItemIds,
    ...unreviewedItemIds,
  ]);
  const ready =
    abs(outputDifferenceMinor) <= policy.maxLedgerDifferenceMinor &&
    abs(inputDifferenceMinor) <= policy.maxLedgerDifferenceMinor &&
    abs(unreviewedInputVatMinor) <= policy.maxUnreviewedInputMinor &&
    unresolved.size <= policy.maxUnresolvedItemCount &&
    new Set(missingEvidenceItemIds).size <= policy.maxMissingEvidenceCount;
  return Object.freeze({
    organizationId,
    currency: currency(input.currency),
    startsOn,
    endsOn,
    formulaVersion: VAT_RECONCILIATION_FORMULA_VERSION,
    policyId: policy.id,
    policyVersion: policy.version,
    status: ready ? "ready" : "review_required",
    outputVatMinor,
    inputVatMinor,
    eligibleInputVatMinor,
    ineligibleInputVatMinor,
    unreviewedInputVatMinor,
    netVatPayableMinor,
    outputVatLedgerMinor: input.outputVatLedgerMinor,
    inputVatLedgerMinor: input.inputVatLedgerMinor,
    outputDifferenceMinor,
    inputDifferenceMinor,
    missingEvidenceItemIds: unique(missingEvidenceItemIds),
    unreconciledItemIds: unique(unreconciledItemIds),
    invalidTaxCodeItemIds: unique(invalidTaxCodeItemIds),
    unreviewedItemIds: unique(unreviewedItemIds),
    sourceIds: unique(sourceIds),
    journalIds: unique(journalIds),
    confidenceFlags: Object.freeze(confidenceFlags),
  });
}

export function buildTaxExpenseReview(
  input: Readonly<{
    organizationId: string;
    currency: string;
    startsOn: string;
    endsOn: string;
    items: readonly TaxExpenseReviewItem[];
  }>,
): TaxExpenseReview {
  const organizationId = required(input.organizationId, "Tax review organization ID");
  const startsOn = isoDate(input.startsOn, "Tax review start date"),
    endsOn = isoDate(input.endsOn, "Tax review end date");
  if (startsOn > endsOn) throw new Error("Tax review period is invalid");
  let accountingBookedMinor = 0n,
    citBasisMinor = 0n,
    citEligibleMinor = 0n,
    citIneligibleMinor = 0n,
    citUnreviewedMinor = 0n,
    vatBasisMinor = 0n,
    vatEligibleMinor = 0n,
    vatIneligibleMinor = 0n,
    vatUnreviewedMinor = 0n;
  const missingEvidenceItemIds: string[] = [],
    unreviewedItemIds: string[] = [],
    sourceIds: string[] = [];
  for (const item of input.items) {
    required(item.id, "Tax expense item ID");
    sourceIds.push(required(item.sourceId, "Tax expense source ID"));
    if (item.accountingBookedMinor < 0n)
      throw new Error("Accounting booked amount cannot be negative");
    const cit = normalizeEligibility(
        item.citBasisMinor,
        item.citReviewState,
        item.citEligibleMinor,
        item,
      ),
      vat = normalizeEligibility(
        item.vatBasisMinor,
        item.vatReviewState,
        item.vatEligibleMinor,
        item,
      );
    accountingBookedMinor += item.accountingBookedMinor;
    citBasisMinor += item.citBasisMinor;
    citEligibleMinor += cit.eligible;
    citIneligibleMinor += cit.ineligible;
    citUnreviewedMinor += cit.unreviewed;
    vatBasisMinor += item.vatBasisMinor;
    vatEligibleMinor += vat.eligible;
    vatIneligibleMinor += vat.ineligible;
    vatUnreviewedMinor += vat.unreviewed;
    if (item.citReviewState === "unreviewed" || item.vatReviewState === "unreviewed")
      unreviewedItemIds.push(item.id);
    if (missingEvidence(item.requiredEvidenceTypes, item.presentEvidenceTypes))
      missingEvidenceItemIds.push(item.id);
  }
  const confidenceFlags: TaxExpenseReview["confidenceFlags"][number][] = [];
  if (missingEvidenceItemIds.length)
    confidenceFlags.push({
      code: "tax_expense_missing_evidence",
      severity: "critical",
      itemIds: unique(missingEvidenceItemIds),
    });
  if (unreviewedItemIds.length)
    confidenceFlags.push({
      code: "tax_expense_unreviewed",
      severity: "warning",
      itemIds: unique(unreviewedItemIds),
    });
  return Object.freeze({
    organizationId,
    currency: currency(input.currency),
    startsOn,
    endsOn,
    formulaVersion: TAX_EXPENSE_REVIEW_FORMULA_VERSION,
    status: confidenceFlags.length ? "review_required" : "ready",
    accountingBookedMinor,
    citBasisMinor,
    citEligibleMinor,
    citIneligibleMinor,
    citUnreviewedMinor,
    vatBasisMinor,
    vatEligibleMinor,
    vatIneligibleMinor,
    vatUnreviewedMinor,
    missingEvidenceItemIds: unique(missingEvidenceItemIds),
    unreviewedItemIds: unique(unreviewedItemIds),
    sourceIds: unique(sourceIds),
    confidenceFlags: Object.freeze(confidenceFlags),
  });
}
