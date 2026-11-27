import type { BankTransactionState } from "./banking.js";

export const RECONCILIATION_TARGET_KINDS = [
  "sales_invoice",
  "purchase_invoice",
  "expense",
  "journal_line",
] as const;
export type ReconciliationTargetKind = (typeof RECONCILIATION_TARGET_KINDS)[number];
export type PaymentDirection = "receipt" | "payment";

export type MatchingPolicy = Readonly<{
  version: number;
  dateToleranceDays: number;
  autoMatchThresholdBps: number;
  weights: Readonly<{
    amount: number;
    date: number;
    reference: number;
    party: number;
    currency: number;
    outstanding: number;
  }>;
}>;

export type ReconciliationTransactionView = Readonly<{
  id: string;
  state: BankTransactionState;
  amountMinor: bigint;
  currency: string;
  bookingDate: string;
  reference?: string;
  counterpartyName?: string;
  partyId?: string;
}>;

export type ReconciliationCandidate = Readonly<{
  id: string;
  targetKind: ReconciliationTargetKind;
  targetId: string;
  direction: PaymentDirection;
  currency: string;
  outstandingMinor: bigint;
  documentDate: string;
  reference?: string;
  partyId?: string;
  counterpartyName?: string;
  allowFx?: boolean;
}>;

export type CandidateScore = Readonly<{
  candidateId: string;
  policyVersion: number;
  eligible: boolean;
  totalBps: number;
  factors: Readonly<{
    amountBps: number;
    dateBps: number;
    referenceBps: number;
    partyBps: number;
    currencyBps: number;
    outstandingBps: number;
  }>;
  reasons: readonly string[];
}>;

export type AutoMatchDecision = Readonly<{
  outcome: "unique" | "ambiguous" | "none";
  candidateId?: string;
  scores: readonly CandidateScore[];
}>;

export type ReconciliationAllocation = Readonly<{
  lineNumber: number;
  targetKind: ReconciliationTargetKind;
  targetId: string;
  controlAccountId: string;
  statementAmountMinor: bigint;
  targetAmountMinor: bigint;
  baseAmountMinor: bigint;
  targetOutstandingBeforeMinor: bigint;
  exchangeRateId?: string;
}>;

export type ReconciliationAdjustmentKind = "bank_fee" | "realized_fx" | "suspense";
export type ReconciliationAdjustment = Readonly<{
  lineNumber: number;
  kind: ReconciliationAdjustmentKind;
  accountId: string;
  side: "debit" | "credit";
  statementAmountMinor: bigint;
  baseAmountMinor: bigint;
  reason: string;
  exchangeRateId?: string;
}>;

export type ReconciliationAttemptState = "matched" | "reconciled" | "unreconciled";
export type ReconciliationAttempt = Readonly<{
  attemptNumber: number;
  state: ReconciliationAttemptState;
  allocations: readonly ReconciliationAllocation[];
  adjustments: readonly ReconciliationAdjustment[];
  policyVersion: number;
  candidateGeneration: number;
  bankBaseAmountMinor: bigint;
  manualOverrideReason?: string;
  journalId?: string;
  reversalJournalId?: string;
  reconciledBy?: string;
  reconciledReason?: string;
  unreconciledBy?: string;
  unreconciledReason?: string;
}>;

export type PaymentReconciliation = Readonly<{
  organizationId: string;
  id: string;
  bankTransactionId: string;
  direction: PaymentDirection;
  statementAmountMinor: bigint;
  statementCurrency: string;
  attempts: readonly ReconciliationAttempt[];
  version: number;
}>;

export type ReconciliationJournalLine = Readonly<{
  id: string;
  accountId: string;
  debitMinor?: bigint;
  creditMinor?: bigint;
  sourceKind: "bank" | "allocation" | "adjustment";
  sourceId: string;
}>;
