import type { MutationMetadata } from "./index.js";

export const BANKING_CONTROL_CONTRACT_VERSION = 1 as const;

export type StatementTransactionControlContract = Readonly<{
  id: string;
  bankTransactionId: string;
  importId: string;
  bookingDate: string;
  amountMinor: string;
  disposition: "accepted" | "duplicate" | "excluded";
  controlStatus: "unexplained" | "reconciled" | "internal_transfer" | "ignored" | "suspense";
  explanationReference?: string;
  dispositionReason?: string;
}>;

export type StatementSuspenseExceptionContract = Readonly<{
  id: string;
  kind: "suspense";
  bankTransactionId: string;
  amountMinor: string;
  currency: string;
  reason: string;
  ownerId: string;
  reviewDue: string;
  state: "pending" | "approved" | "resolved" | "rejected";
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalReason?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionReference?: string;
  resolutionReason?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}>;

export type CreateBankStatementSessionRequest = Readonly<{
  schemaVersion: typeof BANKING_CONTROL_CONTRACT_VERSION;
  id?: string;
  financialAccountId: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  openingBalanceMinor: string;
  closingBalanceMinor: string;
  importIds: readonly string[];
  reason: string;
}>;

export type ReviewBankStatementSessionRequest = Readonly<{
  schemaVersion: typeof BANKING_CONTROL_CONTRACT_VERSION;
  reason: string;
  expectedResourceVersion: string;
}>;

export type CloseBankStatementSessionRequest = ReviewBankStatementSessionRequest;

export type CreateStatementExceptionRequest = Readonly<{
  schemaVersion: typeof BANKING_CONTROL_CONTRACT_VERSION;
  id?: string;
  kind: "suspense";
  bankTransactionId: string;
  amountMinor: string;
  currency: string;
  ownerId: string;
  reviewDue: string;
  reason: string;
}>;

export type ApproveStatementExceptionRequest = Readonly<{
  schemaVersion: typeof BANKING_CONTROL_CONTRACT_VERSION;
  reason: string;
  expectedResourceVersion: string;
}>;

export type ResolveStatementExceptionRequest = Readonly<{
  schemaVersion: typeof BANKING_CONTROL_CONTRACT_VERSION;
  reason: string;
  resolutionReference: string;
  expectedResourceVersion: string;
}>;

export type RejectStatementExceptionRequest = ApproveStatementExceptionRequest;

export type BankStatementControlEventContract = Readonly<{
  sequence: number;
  action:
    | "create"
    | "review"
    | "create_exception"
    | "approve_exception"
    | "resolve_exception"
    | "reject_exception"
    | "close";
  actorId: string;
  occurredAt: string;
  reason: string;
  correlationId: string;
}>;

export type BankStatementSessionSummaryContract = Readonly<{
  id: string;
  financialAccountId: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  openingBalanceMinor: string;
  closingBalanceMinor: string;
  importIds: readonly string[];
  state: "draft" | "reviewed" | "closed";
  resourceVersion: string;
  nextActions: readonly string[];
  events: readonly BankStatementControlEventContract[];
  reviewedBy?: string;
  reviewedAt?: string;
  closedBy?: string;
  closedAt?: string;
}>;

export type BankStatementImportLinkContract = Readonly<{
  importId: string;
  transactionCount: number;
  acceptedTransactionCount: number;
}>;

export type BankStatementControlSummaryContract = Readonly<{
  expectedMovementMinor: string;
  controlDifferenceMinor: string;
  acceptedTransactionCount: number;
  explainedTransactionCount: number;
  pendingExceptionCount: number;
  closeBlockers: readonly string[];
  closable: boolean;
}>;

export type BankStatementSessionDetailContract = Readonly<{
  session: BankStatementSessionSummaryContract;
  imports: readonly BankStatementImportLinkContract[];
  transactions: readonly StatementTransactionControlContract[];
  exceptions: readonly StatementSuspenseExceptionContract[];
  control: BankStatementControlSummaryContract;
}>;

export type BankStatementSessionContract = BankStatementSessionDetailContract;

export type BankStatementSessionMutationResult = Readonly<{
  statementSession: BankStatementSessionDetailContract;
  mutation: MutationMetadata;
}>;
