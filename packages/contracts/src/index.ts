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
export {
  AGING_CONTRACT_VERSION,
  type AgingBalanceKindContract,
  type AgingBucketContract,
  type AgingBucketTotalContract,
  type AgingControlTieContract,
  type AgingDrilldownContract,
  type AgingExceptionContract,
  type AgingItemContract,
  type AgingItemDetailContract,
  type AgingListQueryContract,
  type AgingPaymentStatusContract,
  type AgingReportContract,
  type AgingSideContract,
} from "./aging.js";
export {
  BANKING_CONTROL_CONTRACT_VERSION,
  type ApproveStatementExceptionRequest,
  type BankStatementControlEventContract,
  type BankStatementControlSummaryContract,
  type BankStatementImportLinkContract,
  type BankStatementSessionContract,
  type BankStatementSessionDetailContract,
  type BankStatementSessionMutationResult,
  type BankStatementSessionSummaryContract,
  type CloseBankStatementSessionRequest,
  type CreateBankStatementSessionRequest,
  type CreateStatementExceptionRequest,
  type RejectStatementExceptionRequest,
  type ResolveStatementExceptionRequest,
  type ReviewBankStatementSessionRequest,
  type StatementSuspenseExceptionContract,
  type StatementTransactionControlContract,
} from "./banking-controls.js";
export {
  TIME_CONTRACT_VERSION,
  type AppliedLaborCostContract,
  type CreateLaborCostRateRequest,
  type CreateTimeAdjustmentRequest,
  type CreateTimesheetRequest,
  type CreateWorkerCapacityVersionRequest,
  type CreateWorkforceProfileRequest,
  type LaborCostRateContract,
  type LaborCostRateTransitionRequest,
  type MarkTimesheetBilledRequest,
  type TimeAdjustmentContract,
  type TimeAdjustmentTransitionRequest,
  type TimeCapacitySummaryContract,
  type TimeEntryContract,
  type TimeEntryInputContract,
  type TimeMutationResult,
  type TimesheetContract,
  type TimesheetTransitionRequest,
  type WorkerCapacityVersionContract,
  type WorkforceProfileContract,
} from "./time.js";
export {
  PROJECT_COST_CONTRACT_VERSION,
  type CreateDirectCostAllocationRequest,
  type CreateDirectCostSplitRequest,
  type DirectCostAllocationContract,
  type DirectCostAllocationEventContract,
  type DirectCostAllocationMutationResult,
  type DirectCostAllocationTransitionRequest,
  type DirectCostSplitContract,
  type ProjectCostBasisContract,
  type ProjectCostClassContract,
  type ProjectCostDrilldownContract,
  type ProjectCostItemContract,
  type ProjectCostSourceContract,
  type ProjectCostSourceTypeContract,
} from "./project-costs.js";
