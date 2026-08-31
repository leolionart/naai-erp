export const TAX_RECONCILIATION_CONTRACT_VERSION = 1 as const;
export const VAT_RECONCILIATION_FORMULA_VERSION = "vat-reconciliation-v1" as const;
export const TAX_EXPENSE_REVIEW_FORMULA_VERSION = "tax-expense-review-v1" as const;

export type TaxReviewStateContract =
  "eligible" | "partially_eligible" | "ineligible" | "unreviewed" | "accountant_override";
export type TaxReportStatusContract = "ready" | "review_required";

export type VatReconciliationQueryContract = Readonly<{
  startsOn: string;
  endsOn: string;
  policyId?: string;
}>;
export type VatReconciliationPolicyContract = Readonly<{
  id: string;
  version: number;
  maxLedgerDifferenceMinor: string;
  maxUnreviewedInputMinor: string;
  maxUnresolvedItemCount: number;
  maxMissingEvidenceCount: number;
}>;
export type VatReconciliationContract = Readonly<{
  schemaVersion: typeof TAX_RECONCILIATION_CONTRACT_VERSION;
  organizationId: string;
  currency: string;
  startsOn: string;
  endsOn: string;
  formulaVersion: typeof VAT_RECONCILIATION_FORMULA_VERSION;
  policyId: string;
  policyVersion: number;
  status: TaxReportStatusContract;
  outputVatMinor: string;
  inputVatMinor: string;
  eligibleInputVatMinor: string;
  ineligibleInputVatMinor: string;
  unreviewedInputVatMinor: string;
  netVatPayableMinor: string;
  outputVatLedgerMinor: string;
  inputVatLedgerMinor: string;
  outputDifferenceMinor: string;
  inputDifferenceMinor: string;
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
    amountMinor?: string;
    itemIds: readonly string[];
  }>[];
  /** Source rows exposed for actionable VAT drill-downs. */
  items?: readonly Readonly<{
    id: string;
    sourceId: string;
    lineNumber?: number;
    sourceType:
      | "sales_invoice"
      | "sales_credit_note"
      | "purchase_invoice"
      | "purchase_credit_note"
      | "expense";
    taxKind: "output" | "input";
    taxMinor: string;
    direction: "normal" | "reversal";
    reviewState?: TaxReviewStateContract;
    eligibleMinor?: string;
    reviewerId?: string;
    reviewReason?: string;
    reviewReferenceId?: string;
    taxCode?: string;
    taxCodeApproved: boolean;
    postedToLedger: boolean;
    journalId?: string;
    requiredEvidenceTypes: readonly string[];
    presentEvidenceTypes: readonly string[];
    sourceIds: Readonly<Record<string, string>>;
    nextActions: readonly string[];
    exceptionCodes: readonly string[];
  }>[];
}>;

export type TaxExpenseReviewContract = Readonly<{
  schemaVersion: typeof TAX_RECONCILIATION_CONTRACT_VERSION;
  organizationId: string;
  currency: string;
  startsOn: string;
  endsOn: string;
  formulaVersion: typeof TAX_EXPENSE_REVIEW_FORMULA_VERSION;
  status: TaxReportStatusContract;
  accountingBookedMinor: string;
  citBasisMinor: string;
  citEligibleMinor: string;
  citIneligibleMinor: string;
  citUnreviewedMinor: string;
  vatBasisMinor: string;
  vatEligibleMinor: string;
  vatIneligibleMinor: string;
  vatUnreviewedMinor: string;
  missingEvidenceItemIds: readonly string[];
  unreviewedItemIds: readonly string[];
  sourceIds: readonly string[];
  confidenceFlags: readonly Readonly<{
    code: "tax_expense_missing_evidence" | "tax_expense_unreviewed";
    severity: "warning" | "critical";
    itemIds: readonly string[];
  }>[];
}>;
