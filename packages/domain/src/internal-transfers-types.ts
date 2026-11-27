import type { BankTransactionState } from "./banking.js";

export type TransferLegRole = "source" | "destination";
export type InternalTransferState =
  "pending_counterpart" | "matched" | "reconciled" | "unmatched" | "needs_review";

export type OwnedTransferTransaction = Readonly<{
  id: string;
  financialAccountId: string;
  ledgerAccountId: string;
  amountMinor: bigint;
  currency: string;
  bookingDate: string;
  reference?: string;
  state: BankTransactionState;
}>;

export type TransferLeg = Readonly<{
  role: TransferLegRole;
  transaction: OwnedTransferTransaction;
  statementAmountMinor: bigint;
  principalAmountMinor: bigint;
  baseAmountMinor: bigint;
  journalId?: string;
}>;

export type InternalTransferFee = Readonly<{
  mode: "embedded" | "separate_transaction";
  amountMinor: bigint;
  baseAmountMinor: bigint;
  expenseAccountId: string;
  reason: string;
  transactionId?: string;
  transaction?: OwnedTransferTransaction;
  journalId?: string;
}>;

export type InternalTransferAttempt = Readonly<{
  attemptNumber: number;
  state: InternalTransferState;
  source?: TransferLeg;
  destination?: TransferLeg;
  fee?: InternalTransferFee;
  postingMode: "direct" | "transit";
  transitAccountId: string;
  journalIds: readonly string[];
  reversalJournalIds: readonly string[];
}>;

export type TransferAuditEvent = Readonly<{
  action: "create" | "match" | "post" | "unmatch";
  actorId: string;
  reason: string;
  idempotencyKey: string;
  commandFingerprint: string;
  attemptNumber: number;
}>;

export type InternalTransfer = Readonly<{
  organizationId: string;
  id: string;
  principalAmountMinor: bigint;
  basePrincipalAmountMinor: bigint;
  currency: string;
  attempts: readonly InternalTransferAttempt[];
  events: readonly TransferAuditEvent[];
  version: number;
}>;

export type TransferCandidatePolicy = Readonly<{
  version: number;
  dateToleranceDays: number;
  autoMatchThresholdBps: number;
  weights: Readonly<{
    amount: number;
    date: number;
    reference: number;
    currency: number;
    ownAccount: number;
  }>;
}>;

export type TransferCandidateScore = Readonly<{
  candidateTransactionId: string;
  eligible: boolean;
  totalBps: number;
  factors: Readonly<{
    amountBps: number;
    dateBps: number;
    referenceBps: number;
    currencyBps: number;
    ownAccountBps: number;
  }>;
  reasons: readonly string[];
}>;

export type TransferCandidateDecision = Readonly<{
  outcome: "unique" | "ambiguous" | "none";
  candidateTransactionId?: string;
  scores: readonly TransferCandidateScore[];
}>;

export type TransferJournalLine = Readonly<{
  id: string;
  accountId: string;
  accountRole: "bank" | "transit" | "fee_expense";
  debitMinor?: bigint;
  creditMinor?: bigint;
}>;

export type TransferJournalDraft = Readonly<{
  id: string;
  purpose: "direct_transfer" | "source_to_transit" | "transit_to_destination" | "separate_fee";
  lines: readonly TransferJournalLine[];
}>;
