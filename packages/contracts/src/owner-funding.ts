export const OWNER_FUNDING_CONTRACT_VERSION = 1 as const;

export type OwnerFundingMovementTypeContract = "owner_funding" | "owner_repayment";
export type OwnerFundingEntryModeContract = "bank_transaction" | "manual";

export type RecordOwnerFundingRequest = Readonly<{
  schemaVersion?: typeof OWNER_FUNDING_CONTRACT_VERSION;
  id?: string;
  movementType?: OwnerFundingMovementTypeContract;
  bankTransactionId?: string;
  financialAccountId?: string;
  bookingDate?: string;
  amountMinor?: string;
  currency?: string;
  reference?: string;
  description?: string;
  reason: string;
}>;

export type OwnerFundingLinkedRecordContract = Readonly<{
  kind: "expense" | "purchase_invoice";
  id: string;
  date: string;
  grossMinor: string;
  currency: string;
  state: string;
  description: string;
}>;

export type OwnerFundingMovementContract = Readonly<{
  id: string;
  movementId: string;
  movementType: OwnerFundingMovementTypeContract;
  entryMode: OwnerFundingEntryModeContract;
  financialAccountId: string;
  financialAccountCode: string;
  bankTransactionId: string;
  journalId: string;
  bookingDate: string;
  amountMinor: string;
  currency: string;
  reference: string | null;
  description: string;
  reason: string;
  linkedSpendMinor: string;
  linkedRecords: readonly OwnerFundingLinkedRecordContract[];
  createdBy: string;
  createdAt: string;
}>;

export type RecordOwnerFundingResponseContract = Readonly<{
  movementId: string;
  movementType: OwnerFundingMovementTypeContract;
  entryMode: OwnerFundingEntryModeContract;
  financialAccountId: string;
  transactionId: string;
  journalId: string;
  bookingDate: string;
  amountMinor: string;
  currency: string;
  reference: string | null;
  status: "posted";
  resourceVersion: string;
  eventId: string;
  auditEventId: string;
  outboxEventId: string;
  idempotencyReplayed: boolean;
  nextActions: readonly string[];
}>;

export type OwnerFundingListSummaryContract = Readonly<{
  ownerFundingMinor: string;
  ownerRepaymentMinor: string;
  netOwnerBankFundingMinor: string;
}>;

export type OwnerFundingListContract = Readonly<{
  items: readonly OwnerFundingMovementContract[];
  summary: OwnerFundingListSummaryContract;
}>;
