export const AGING_CONTRACT_VERSION = 1 as const;

export type AgingSideContract = "ar" | "ap";
export type AgingBucketContract =
  "current" | "1_30" | "31_60" | "61_90" | "over_90" | "unclassified";
export type AgingPaymentStatusContract = "unpaid" | "partially_paid" | "paid";
export type AgingBalanceKindContract =
  "receivable" | "customer_credit" | "payable" | "supplier_advance";

export type AgingListQueryContract = Readonly<{
  asOf: string;
  partyId?: string;
  accountCode?: string;
  bucket?: AgingBucketContract;
  paymentStatus?: AgingPaymentStatusContract;
  includeSettled?: boolean;
  cursor?: string;
  limit?: number;
}>;

export type AgingDrilldownContract = Readonly<{
  sourceType: "commercial_document" | "opening_balance";
  sourceId: string;
  journalIds: readonly string[];
  reconciliationIds: readonly string[];
  evidenceIds: readonly string[];
  sourceHref: string;
  journalHrefs: readonly string[];
  reconciliationHrefs: readonly string[];
  evidenceHrefs: readonly string[];
}>;

export type AgingItemContract = Readonly<{
  id: string;
  side: AgingSideContract;
  balanceKind: AgingBalanceKindContract;
  partyId: string;
  partyName: string;
  controlAccountCode: string;
  documentNumber: string;
  documentDate: string;
  dueDate?: string;
  currency: string;
  bucket: AgingBucketContract;
  daysOverdue?: number;
  paymentStatus: AgingPaymentStatusContract;
  originalMinor: string;
  settledMinor: string;
  outstandingMinor: string;
  signedOutstandingMinor: string;
  baseOutstandingMinor: string;
  signedBaseOutstandingMinor: string;
  drilldown: AgingDrilldownContract;
}>;

export type AgingBucketTotalContract = Readonly<{
  bucket: AgingBucketContract;
  amountMinor: string;
  baseAmountMinor: string;
  itemCount: number;
}>;

export type AgingControlTieContract = Readonly<{
  controlAccountCode: string;
  currency: string;
  status: "tied" | "out_of_balance" | "unsupported_fx";
  subledgerBalanceMinor: string;
  ledgerBalanceMinor: string;
  differenceMinor: string;
  subledgerBaseBalanceMinor: string;
  ledgerBaseBalanceMinor: string;
  baseDifferenceMinor: string;
}>;

export type AgingExceptionContract = Readonly<{
  code: "MISSING_DUE_DATE" | "AGING_UNSUPPORTED_FX" | "CONTROL_ACCOUNT_OUT_OF_BALANCE";
  itemId?: string;
  controlAccountCode?: string;
  currency?: string;
  message: string;
}>;

export type AgingReportContract = Readonly<{
  schemaVersion: typeof AGING_CONTRACT_VERSION;
  organizationId: string;
  side: AgingSideContract;
  asOf: string;
  timezone: string;
  baseCurrency: string;
  source: "posted-ledger";
  filters: Omit<AgingListQueryContract, "asOf" | "cursor" | "limit">;
  bucketTotals: readonly AgingBucketTotalContract[];
  creditOrAdvanceTotalMinor: string;
  baseCreditOrAdvanceTotalMinor: string;
  outstandingTotalMinor: string;
  baseOutstandingTotalMinor: string;
  controlTies: readonly AgingControlTieContract[];
  tieStatus: "tied" | "out_of_balance" | "unsupported_fx";
  exceptions: readonly AgingExceptionContract[];
  items: readonly AgingItemContract[];
  nextCursor?: string;
}>;

export type AgingItemDetailContract = Readonly<{
  schemaVersion: typeof AGING_CONTRACT_VERSION;
  asOf: string;
  item: AgingItemContract;
  controlTie: AgingControlTieContract;
  movementIds: readonly string[];
}>;
