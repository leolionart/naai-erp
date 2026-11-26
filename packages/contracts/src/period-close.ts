export const PERIOD_CLOSE_CONTRACT_VERSION = 1 as const;

export type CloseChecklistItemCodeContract =
  | "unlinked_funding"
  | "payment_evidence_gaps"
  | "ap_tied"
  | "tax_finalization"
  | "bank_reconciled"
  | "owner_custody_non_negative";

export type CloseChecklistItemStatusContract = "passed" | "noted" | "warning";

export type NegativeCustodyAlertContract = Readonly<{
  isNegative: boolean;
  custodyAccountCode: string;
  balanceMinor: string;
  deficitMinor: string;
  suggestedTargetFunding: "owner_paid";
  message: string;
  actionHref: string;
}>;

export type PeriodCloseChecklistNoteContract = Readonly<{
  itemCode: CloseChecklistItemCodeContract;
  note: string;
  reason: string;
  notedBy: string;
  updatedAt: string;
}>;

export type PeriodCloseChecklistItemContract = Readonly<{
  code: CloseChecklistItemCodeContract;
  label: string;
  status: CloseChecklistItemStatusContract;
  summary: string;
  count?: number;
  amountMinor?: string;
  actionHref?: string;
  note?: PeriodCloseChecklistNoteContract | null;
  details: Readonly<Record<string, unknown>>;
}>;

export type PeriodCloseChecklistContract = Readonly<{
  schemaVersion: 1;
  fiscalYear: number;
  periodNumber: number;
  startsOn: string;
  endsOn: string;
  periodState: "open" | "soft_locked" | "hard_locked";
  currency: string;
  readyWithoutWarnings: boolean;
  canCloseWithReason: boolean;
  warningCount: number;
  items: readonly PeriodCloseChecklistItemContract[];
  warnings: readonly CloseChecklistItemCodeContract[];
  negativeCustodyAlert: NegativeCustodyAlertContract | null;
}>;

export type RecordCloseChecklistNoteRequestContract = Readonly<{
  itemCode: CloseChecklistItemCodeContract;
  note: string;
  reason: string;
}>;

export type CashCountStatusContract = "matched" | "overage" | "shortage";

export type OwnerCustodyCashCountContract = Readonly<{
  id: string;
  countedOn: string;
  custodyAccountCode: string;
  bookBalanceMinor: string;
  countedBalanceMinor: string;
  differenceMinor: string;
  afterCustodyBalanceMinor: string;
  status: CashCountStatusContract;
  adjustmentAccountCode: string | null;
  journalId: string | null;
  currency: string;
  reason: string;
  note: string | null;
  countedBy: string;
  createdAt: string;
}>;

export type RecordCashCountRequestContract = Readonly<{
  id?: string;
  countedOn: string;
  countedBalanceMinor: string;
  adjustmentAccountCode?: string;
  note?: string;
  reason: string;
}>;

export type OwnerSettlementOptionContract =
  "repayment" | "offset_3388_1388" | "profit_distribution";

export type OwnerRepaymentDirectionContract = "company_to_owner" | "owner_to_company";

export type OwnerYearEndPositionOptionPreviewContract = Readonly<{
  option: OwnerSettlementOptionContract;
  label: string;
  available: boolean;
  maxEligibleMinor: string;
  debitAccountPreview: string;
  creditAccountPreview: string;
  description: string;
}>;

export type OwnerYearEndSettlementRecordContract = Readonly<{
  id: string;
  fiscalYear: number;
  effectiveOn: string;
  option: OwnerSettlementOptionContract;
  repaymentDirection: OwnerRepaymentDirectionContract | null;
  amountMinor: string;
  currency: string;
  debitAccountCode: string;
  creditAccountCode: string;
  financialAccountId: string | null;
  bankTransactionId: string | null;
  journalId: string;
  beforePayable3388Minor: string;
  beforeReceivable1388Minor: string;
  beforeCustody111Minor: string;
  afterPayable3388Minor: string;
  afterReceivable1388Minor: string;
  afterCustody111Minor: string;
  reference: string | null;
  description: string;
  reason: string;
  createdBy: string;
  createdAt: string;
}>;

export type OwnerYearEndPositionReportContract = Readonly<{
  schemaVersion: 1;
  fiscalYear: number;
  asOf: string;
  currency: string;
  payable3388AccountCode: string;
  receivable1388AccountCode: string;
  custody111AccountCode: string;
  retainedEarnings421AccountCode: string;
  payable3388Minor: string;
  receivable1388Minor: string;
  ownerCustody111Minor: string;
  retainedEarnings421Minor: string;
  unclosedProfitMinor: string;
  netOwnerPositionMinor: string;
  negativeCustodyAlert: NegativeCustodyAlertContract | null;
  options: readonly OwnerYearEndPositionOptionPreviewContract[];
  settlements: readonly OwnerYearEndSettlementRecordContract[];
}>;

export type ExecuteOwnerSettlementRequestContract = Readonly<{
  id?: string;
  fiscalYear: number;
  effectiveOn?: string;
  option: OwnerSettlementOptionContract;
  repaymentDirection?: OwnerRepaymentDirectionContract;
  financialAccountId?: string;
  amountMinor?: string;
  reference?: string;
  description?: string;
  reason: string;
}>;
