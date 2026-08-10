import type { MutationMetadata } from "./index.js";

export const BANKING_CONTRACT_VERSION = 1 as const;

export type BankAccountContract = Readonly<{
  id: string;
  code: string;
  displayName: string;
  kind: "bank" | "cash";
  currency: string;
  ledgerAccountCode: string;
  bankCode?: string;
  maskedIdentifier?: string;
  status: "active" | "inactive";
  resourceVersion: string;
}>;

export type CreateBankAccountRequest = Readonly<{
  schemaVersion: typeof BANKING_CONTRACT_VERSION;
  id?: string;
  code: string;
  displayName: string;
  kind: "bank" | "cash";
  currency: string;
  ledgerAccountCode: string;
  bankCode?: string;
  maskedIdentifier?: string;
  accountIdentity?: string;
}>;

export type BankCsvColumnMapping = Readonly<{
  bookingDate: string;
  amountMinor?: string;
  debitMinor?: string;
  creditMinor?: string;
  currency?: string;
  valueDate?: string;
  reference?: string;
  counterpartyName?: string;
  counterpartyAccount?: string;
  providerTransactionId?: string;
}>;

export type BankStatementImportRequest = Readonly<{
  schemaVersion: typeof BANKING_CONTRACT_VERSION;
  financialAccountId: string;
  adapterId: string;
  adapterVersion: number;
  filename: string;
  csvText: string;
  columnMapping?: BankCsvColumnMapping;
}>;

export type BankImportRowDisposition =
  "new" | "duplicate_provider_id" | "duplicate_fingerprint" | "invalid";

export type BankImportRowResult = Readonly<{
  rowNumber: number;
  valid: boolean;
  disposition: BankImportRowDisposition;
  sourceKey?: string;
  transactionId?: string;
  errors: readonly string[];
  warnings: readonly string[];
}>;

export type BankStatementImportResult = Readonly<{
  importId?: string;
  dryRun: boolean;
  valid: boolean;
  totalRows: number;
  newRows: number;
  duplicateRows: number;
  invalidRows: number;
  rows: readonly BankImportRowResult[];
  mutation?: MutationMetadata;
}>;

export type BankTransactionContract = Readonly<{
  id: string;
  financialAccountId: string;
  sourceKey: string;
  state: "imported" | "suggested" | "matched" | "reconciled" | "ignored" | "needs_review";
  normalizationVersion: number;
  adapterId: string;
  adapterVersion: number;
  bookingDate: string;
  valueDate?: string;
  amountMinor: string;
  currency: string;
  reference?: string;
  counterpartyName?: string;
  counterpartyAccount?: string;
  providerTransactionId?: string;
  rawPayloadHash: string;
  resourceVersion: string;
  nextActions: readonly string[];
}>;

export type BankTransactionBranchRequest = Readonly<{
  schemaVersion: typeof BANKING_CONTRACT_VERSION;
  reason: string;
}>;

export type OwnerSettlementMovementTypeContract =
  "owner_paid_company_cost" | "owner_custody_cash" | "owner_personal_withdrawal" | "owner_funding";

export type OwnerSettlementClassificationBasisContract =
  | "canonical_owner_paid_expense"
  | "canonical_owner_custody_receipt"
  | "company_funds_withdrawn_by_owner"
  | "owner_funding_to_company_funds";

export type OwnerSettlementReviewReasonContract =
  | "unsupported_company_repayment"
  | "missing_source_of_funds_evidence"
  | "unresolved_owner_current_movement";

export type OwnerCurrentSourceContract = Readonly<{
  sourceType:
    | "expense"
    | "purchase_invoice"
    | "owner_custody_receipt"
    | "bank_transaction"
    | "internal_transfer"
    | "journal";
  sourceId: string;
  title: string;
  detail: string | null;
  sourceHref: string;
  expenseClass: string | null;
  category: string | null;
  fundingTreatments: readonly string[];
  citState: string | null;
  vatState: string | null;
  grossMinor: string;
  payeeName: string | null;
}>;

export type OwnerCurrentCounterpartLineContract = Readonly<{
  accountCode: string;
  accountName: string;
  debitMinor: string;
  creditMinor: string;
  description: string;
}>;

type OwnerCurrentMovementEvidenceContract = Readonly<{
  journalId: string;
  date: string;
  description: string;
  currency: string;
  state: "posted" | "reversed";
  reversalOfId: string | null;
  ownerDeltaMinor: string;
  companyFundsDeltaMinor: string;
  ownerAccountCodes: readonly string[];
  counterpartLines: readonly OwnerCurrentCounterpartLineContract[];
  sources: readonly OwnerCurrentSourceContract[];
}>;

export type ConfirmedOwnerSettlementMovementContract = OwnerCurrentMovementEvidenceContract &
  Readonly<{
    movementType: OwnerSettlementMovementTypeContract;
    classificationBasis: OwnerSettlementClassificationBasisContract;
    needsReview: false;
    settlementDeltaMinor: string;
    runningConfirmedSettlementBalanceMinor: string;
  }>;

export type OwnerSettlementReviewItemContract = OwnerCurrentMovementEvidenceContract &
  Readonly<{
    proposedMovementType: "company_repayment_to_owner" | null;
    reviewReason: OwnerSettlementReviewReasonContract;
    needsReview: true;
  }>;

export type OwnerSettlementSummaryContract = Readonly<{
  statutoryOwnerCurrentBalanceMinor: string;
  confirmedSettlementBalanceMinor: string;
  companyOwesOwnerMinor: string;
  ownerHoldsCompanyFundsMinor: string;
  ownerPaidCompanyCostMinor: string;
  ownerCustodyCashMinor: string;
  ownerPersonalWithdrawalMinor: string;
  ownerFundingMinor: string;
  reviewMinor: string;
  reviewCount: number;
}>;

export type OwnerSettlementPositionContract = Readonly<{
  summary: OwnerSettlementSummaryContract;
  confirmedTimeline: readonly ConfirmedOwnerSettlementMovementContract[];
  reviewItems: readonly OwnerSettlementReviewItemContract[];
}>;
