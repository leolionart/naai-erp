import type { MutationMetadata } from "./index.js";

export const INTERNAL_TRANSFER_CONTRACT_VERSION = 1 as const;

export type TransferFeeContract = Readonly<{
  mode: "embedded" | "separate_transaction";
  amountMinor: string;
  baseAmountMinor: string;
  expenseAccountId: string;
  reason: string;
  transactionId?: string;
  journalId?: string;
}>;

export type TransferLegContract = Readonly<{
  role: "source" | "destination";
  transactionId: string;
  financialAccountId: string;
  ledgerAccountId: string;
  statementAmountMinor: string;
  principalAmountMinor: string;
  baseAmountMinor: string;
  currency: string;
  bookingDate: string;
  journalId?: string;
}>;

export type TransferCandidateContract = Readonly<{
  transactionId: string;
  financialAccountId: string;
  bookingDate: string;
  currency: string;
  amountMinor: string;
  eligible: boolean;
  confidenceBps: number;
  factors: Readonly<{
    amountBps: number;
    dateBps: number;
    referenceBps: number;
    currencyBps: number;
    ownAccountBps: number;
  }>;
  reasons: readonly string[];
}>;

export type TransferCandidateListContract = Readonly<{
  transactionId: string;
  policyVersion: number;
  thresholdBps: number;
  outcome: "unique" | "ambiguous" | "none";
  selectedTransactionId?: string;
  items: readonly TransferCandidateContract[];
}>;

export type CreateInternalTransferRequest = Readonly<{
  schemaVersion: typeof INTERNAL_TRANSFER_CONTRACT_VERSION;
  id?: string;
  sourceTransactionId?: string;
  destinationTransactionId?: string;
  principalAmountMinor: string;
  basePrincipalAmountMinor: string;
  currency: string;
  transitAccountId: string;
  postingMode?: "direct" | "transit";
  fee?: Omit<TransferFeeContract, "journalId">;
  reason: string;
}>;

export type MatchInternalTransferRequest = Readonly<{
  schemaVersion: typeof INTERNAL_TRANSFER_CONTRACT_VERSION;
  counterpartTransactionId: string;
  expectedResourceVersion: string;
  reason: string;
}>;

export type UnmatchInternalTransferRequest = Readonly<{
  schemaVersion: typeof INTERNAL_TRANSFER_CONTRACT_VERSION;
  expectedResourceVersion: string;
  reason: string;
}>;

export type InternalTransferAttemptContract = Readonly<{
  attemptNumber: number;
  state: "pending_counterpart" | "matched" | "reconciled" | "unmatched" | "needs_review";
  postingMode: "direct" | "transit";
  transitAccountId: string;
  source?: TransferLegContract;
  destination?: TransferLegContract;
  fee?: TransferFeeContract;
  journalIds: readonly string[];
  reversalJournalIds: readonly string[];
}>;

export type InternalTransferContract = Readonly<{
  id: string;
  principalAmountMinor: string;
  basePrincipalAmountMinor: string;
  currency: string;
  state: InternalTransferAttemptContract["state"];
  currentAttemptNumber: number;
  attempts: readonly InternalTransferAttemptContract[];
  transitOutstandingMinor: string;
  resourceVersion: string;
  nextActions: readonly string[];
}>;

export type InternalTransferMutationResult = Readonly<{
  transfer: InternalTransferContract;
  mutation: MutationMetadata;
}>;
