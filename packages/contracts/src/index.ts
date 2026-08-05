export const API_VERSION = "v1" as const;

export type ApiError = Readonly<{
  code: string;
  message: string;
  retryable: boolean;
  details?: Readonly<Record<string, unknown>>;
  remediation?: string;
}>;

export type ApiEnvelope<T> = Readonly<{
  apiVersion: typeof API_VERSION;
  requestId: string;
  organizationId: string;
  data?: T;
  error?: ApiError;
}>;

export type MutationMetadata = Readonly<{
  resourceVersion: string;
  auditEventId: string;
  correlationId: string;
  idempotencyReplayed: boolean;
  nextActions: readonly string[];
}>;

export type CursorPage<T> = Readonly<{
  items: readonly T[];
  nextCursor?: string;
}>;

export {
  BANKING_CONTRACT_VERSION,
  type BankAccountContract,
  type BankCsvColumnMapping,
  type BankImportRowDisposition,
  type BankImportRowResult,
  type BankStatementImportRequest,
  type BankStatementImportResult,
  type BankTransactionBranchRequest,
  type BankTransactionContract,
  type CreateBankAccountRequest,
} from "./banking.js";
export {
  RECONCILIATION_CONTRACT_VERSION,
  type CandidateScoreFactorsContract,
  type MatchReconciliationRequest,
  type PaymentReconciliationContract,
  type ReconcilePaymentRequest,
  type ReconciliationAdjustmentRequest,
  type ReconciliationAllocationRequest,
  type ReconciliationAttemptContract,
  type ReconciliationCandidateContract,
  type ReconciliationCandidateListContract,
  type ReconciliationMutationResult,
  type SuggestReconciliationRequest,
  type UnreconcilePaymentRequest,
} from "./reconciliation.js";
export {
  INTERNAL_TRANSFER_CONTRACT_VERSION,
  type CreateInternalTransferRequest,
  type InternalTransferAttemptContract,
  type InternalTransferContract,
  type InternalTransferMutationResult,
  type MatchInternalTransferRequest,
  type TransferCandidateContract,
  type TransferCandidateListContract,
  type TransferFeeContract,
  type TransferLegContract,
  type UnmatchInternalTransferRequest,
} from "./internal-transfers.js";
