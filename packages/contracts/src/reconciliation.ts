import type { MutationMetadata } from "./index.js";

export const RECONCILIATION_CONTRACT_VERSION = 1 as const;

export type CandidateScoreFactorsContract = Readonly<{
  amountBps: number;
  dateBps: number;
  referenceBps: number;
  partyBps: number;
  currencyBps: number;
  outstandingBps: number;
}>;

export type ReconciliationCandidateContract = Readonly<{
  id: string;
  rank: number;
  targetType: "commercial_document" | "expense";
  targetId: string;
  currency: string;
  outstandingMinor: string;
  confidenceBps: number;
  factors: CandidateScoreFactorsContract & Readonly<{ daysApart: number }>;
  status: string;
}>;

export type ReconciliationCandidateListContract = Readonly<{
  id?: string;
  algorithmVersion?: number;
  thresholdBps?: number;
  ambiguityMarginBps?: number;
  createdAt?: string;
  items: readonly ReconciliationCandidateContract[];
}>;

export type SuggestReconciliationRequest = Readonly<{
  schemaVersion: typeof RECONCILIATION_CONTRACT_VERSION;
  thresholdBps?: number;
  ambiguityMarginBps?: number;
}>;

export type ReconciliationAllocationRequest = Readonly<{
  id?: string;
  targetType: "commercial_document" | "expense";
  targetId: string;
  targetAmountMinor: string;
  targetCurrency: string;
  baseAmountMinor: string;
}>;

export type ReconciliationAdjustmentRequest = Readonly<{
  id?: string;
  kind: "bank_fee" | "fx_gain" | "fx_loss" | "suspense";
  accountCode: string;
  side: "debit" | "credit";
  baseAmountMinor: string;
  description: string;
}>;

export type MatchReconciliationRequest = Readonly<{
  schemaVersion: typeof RECONCILIATION_CONTRACT_VERSION;
  id?: string;
  baseAmountMinor: string;
  exchangeRateId?: string;
  manualOverride?: boolean;
  overrideReason?: string;
  overrideReference?: string;
  allocations: readonly ReconciliationAllocationRequest[];
  adjustments?: readonly ReconciliationAdjustmentRequest[];
}>;

export type ReconcilePaymentRequest = Readonly<{
  schemaVersion: typeof RECONCILIATION_CONTRACT_VERSION;
  reason: string;
}>;

export type UnreconcilePaymentRequest = Readonly<{
  schemaVersion: typeof RECONCILIATION_CONTRACT_VERSION;
  reason: string;
}>;

export type ReconciliationAttemptContract = Readonly<{
  attemptNumber: number;
  state: "matched" | "reconciled" | "unreconciled";
  policyVersion: number;
  candidateGeneration: number;
  bankBaseAmountMinor: string;
  allocations: readonly ReconciliationAllocationRequest[];
  adjustments: readonly ReconciliationAdjustmentRequest[];
  manualOverrideReason?: string;
  journalId?: string;
  reversalJournalId?: string;
  reconciledBy?: string;
  reconciledReason?: string;
  unreconciledBy?: string;
  unreconciledReason?: string;
}>;

export type PaymentReconciliationContract = Readonly<{
  id: string;
  bankTransactionId: string;
  direction: "receipt" | "payment";
  statementAmountMinor: string;
  statementCurrency: string;
  state: "matched" | "reconciled" | "unreconciled";
  currentAttemptNumber: number;
  attempts: readonly ReconciliationAttemptContract[];
  resourceVersion: string;
  nextActions: readonly string[];
  drilldown: Readonly<{
    bankTransactionId: string;
    journalId?: string;
    reversalJournalId?: string;
    sourceDocumentIds: readonly string[];
    evidenceIds: readonly string[];
  }>;
}>;

export type ReconciliationMutationResult = Readonly<{
  reconciliation: PaymentReconciliationContract;
  mutation: MutationMetadata;
}>;
