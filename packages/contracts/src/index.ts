export const API_VERSION = "v1" as const;
export {
  EXPENSE_CATEGORY_CONTRACT_VERSION,
  type ExpenseCategoryContract,
  type ExpenseFundingTreatmentContract,
  type OwnerPaidClassificationStatusContract,
} from "./expense-categories.js";
export {
  FILTERED_DOCUMENT_EXPORT_CONTRACT_VERSION,
  type FilteredDocumentExportContract,
  type FilteredDocumentExportKindContract,
  type FilteredDocumentExportQueryContract,
  type FilteredDocumentExportSheetContract,
  type InvoicePresenceFilterContract,
} from "./filtered-document-exports.js";
export {
  PORTABLE_DATA_PACKAGE_HASH_ALGORITHM,
  PORTABLE_DATA_PACKAGE_SCHEMA_VERSION,
  type PortableCellTypeContract,
  type PortableDataPackageManifestContract,
  type PortableDryRunResultContract,
  type PortableDryRunRowResultContract,
  type LocalOrganizationResetRequestContract,
  type LocalOrganizationResetResultContract,
  type EmptyOrganizationRestoreRequestContract,
  type EmptyOrganizationRestoreResultContract,
  type PortableRowEnvelopeContract,
  type PortableRowIssueContract,
  type PortableRowOperationContract,
  type PortableExternalReferenceContract,
  type PortableResourceMutabilityContract,
  type PortableSheetColumnContract,
  type PortableSheetInventoryContract,
  type PortableSheetSchemaContract,
} from "./portable-data-packages.js";
export {
  OVERHEAD_ALLOCATION_CONTRACT_VERSION,
  type CreateOverheadAllocationPolicyRequest,
  type OverheadAllocationMethod,
  type OverheadAllocationMutationResult,
  type OverheadAllocationPolicyContract,
  type OverheadAllocationRunContract,
  type OverheadAllocationSplitContract,
  type OverheadAllocationTransitionRequest,
  type OverheadSourcePoolContract,
} from "./overhead-allocations.js";
export {
  PROJECT_PROFITABILITY_CONTRACT_VERSION,
  type ProjectProfitabilityConfidenceCodeContract,
  type ProjectProfitabilityConfidenceFlagContract,
  type ProjectProfitabilityContract,
  type ProjectProfitabilityDrilldownContract,
  type ProjectProfitabilityGroupByContract,
  type ProjectProfitabilityQueryContract,
} from "./project-profitability.js";
export {
  PLANNING_CONTRACT_VERSION,
  type ActualBasisContract,
  type CreateForecastVersionRequest,
  type CreateRevenueTargetVersionRequest,
  type ForecastVersionContract,
  type PlanningDimensionsContract,
  type PlanningMutationResult,
  type PlanningTransitionRequest,
  type RevenueTargetVersionContract,
} from "./planning.js";
export {
  FORECAST_COMPOSITION_CONTRACT_VERSION,
  type CreateForecastComponentRequest,
  type ForecastComponentContract,
  type ForecastComponentDirectionContract,
  type ForecastComponentKindContract,
  type ForecastComponentListQueryContract,
  type ForecastComponentMutationResult,
  type ForecastComponentReviewStateContract,
  type ForecastComponentSectionContract,
  type ForecastComponentStateContract,
  type ForecastComponentTransitionRequest,
  type ForecastCompositionContract,
  type ForecastSourceIdentityContract,
  type ForecastSourceSnapshotContract,
  type ForecastSourceTypeContract,
  type UpdateForecastComponentRequest,
} from "./forecast-composition.js";

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
  type OwnerCurrentClassificationBasisContract,
  type OwnerCurrentCounterpartLineContract,
  type OwnerCurrentMovementContract,
  type OwnerCurrentMovementTypeContract,
  type OwnerCurrentResponseContract,
  type OwnerCurrentSourceContract,
  type OwnerCurrentSummaryContract,
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
export {
  PROJECT_ECONOMICS_CONTRACT_VERSION,
  type AcceptMilestoneRequest,
  type CreateMilestoneAcceptanceRequest,
  type CreateProjectBudgetVersionRequest,
  type CreateRevenueRecognitionEventRequest,
  type CreateRevenueRecognitionPolicyRequest,
  type CreateScopeChangeRequest,
  type MilestoneAcceptanceContract,
  type ProjectBudgetLineContract,
  type ProjectBudgetVersionContract,
  type ProjectEconomicsMutationResult,
  type ProjectEconomicsTransitionRequest,
  type ProjectRevenueAxesContract,
  type RevenueRecognitionEventContract,
  type RevenueRecognitionPolicyContract,
  type ScopeChangeContract,
} from "./project-economics.js";
export {
  PERFORMANCE_COMPARISON_CONTRACT_VERSION,
  PERFORMANCE_COMPARISON_FORMULA_VERSION,
  PERFORMANCE_NULL_POLICY_VERSION,
  PERFORMANCE_PRORATION_FORMULA_VERSION,
  PERFORMANCE_WINDOW_FORMULA_VERSION,
  type BuildPerformanceComparisonRequest,
  type PerformanceAmountContract,
  type PerformanceAmountStatusContract,
  type PerformanceComparisonBasisContract,
  type PerformanceComparisonContract,
  type PerformanceComparisonLineContract,
  type PerformanceConfidenceFlagContract,
  type PerformancePeriodBasisContract,
  type PerformancePeriodContract,
  type PerformancePeriodKindContract,
  type PerformanceResultStatusContract,
  type PerformanceWindowContract,
} from "./performance-comparisons.js";
export {
  BALANCE_SHEET_FORMULA_VERSION,
  DIRECT_CASH_FLOW_FORMULA_VERSION,
  FINANCIAL_LEDGER_CONTROL_VERSION,
  FINANCIAL_STATEMENT_CONTRACT_VERSION,
  PROFIT_AND_LOSS_FORMULA_VERSION,
  type BalanceSheetContract,
  type CashFlowSectionContract,
  type DirectCashFlowContract,
  type FinancialControlContract,
  type FinancialReportQueryContract,
  type FinancialReportStatusContract,
  type FinancialStatementRowContract,
  type LedgerCutoffContract,
  type ProfitAndLossContract,
  type ProfitAndLossSectionContract,
} from "./financial-statements.js";
export {
  TAX_EXPENSE_REVIEW_FORMULA_VERSION,
  TAX_RECONCILIATION_CONTRACT_VERSION,
  VAT_RECONCILIATION_FORMULA_VERSION,
  type TaxExpenseReviewContract,
  type TaxReportStatusContract,
  type TaxReviewStateContract,
  type VatReconciliationContract,
  type VatReconciliationPolicyContract,
  type VatReconciliationQueryContract,
} from "./tax-reconciliation.js";
export {
  EQUITY_CONSUMED_FORMULA_VERSION,
  EQUITY_ROLL_FORWARD_CONTROL_VERSION,
  EXECUTIVE_METRICS_CONTRACT_VERSION,
  EXECUTIVE_METRICS_FORMULA_VERSION,
  OPERATING_BURN_FORMULA_VERSION,
  PROFITABILITY_RATIO_FORMULA_VERSION,
  PURPOSE_SPECIFIC_ROI_FORMULA_VERSION,
  RETURN_RATIO_FORMULA_VERSION,
  RUNWAY_FORMULA_VERSION,
  type ExecutiveMetricPeriodContract,
  type ExecutiveMetricQueryContract,
  type ExecutiveMetricStatusContract,
  type ExecutiveMetricsContract,
  type ExecutiveRatioContract,
  type ExecutiveSourceBoundaryContract,
  type PurposeSpecificRoiContract,
} from "./executive-metrics.js";
export {
  REPORT_SNAPSHOT_CONTRACT_VERSION,
  type AccountantReportKindContract,
  type CreateReportSnapshotRequest,
  type ReportSnapshotContract,
  type SnapshotMappingContract,
  type SnapshotReadinessContract,
  type SnapshotReproductionContract,
  type SnapshotUnresolvedItemContract,
} from "./report-snapshots.js";
export {
  ACCOUNTANT_EXPORT_CONTRACT_VERSION,
  type AccountantExportContract,
  type AccountantWorkbookContract,
  type CreateAccountantExportRequest,
  type WorkbookCellContract,
  type WorkbookCellValueContract,
  type WorkbookSheetContract,
} from "./accountant-exports.js";
export {
  FINANCIAL_DRILLDOWN_CONTRACT_VERSION,
  type FinancialSourceRefContract,
  type FinancialSourceResolutionContract,
  type FinancialSourceResourceTypeContract,
  type FinancialStatementDrilldownItemContract,
} from "./financial-drilldown.js";
export {
  SERVICE_BUSINESS_METRICS_CONTRACT_VERSION,
  SERVICE_BUSINESS_METRICS_FORMULA_VERSION,
  type ServiceBusinessConfidenceCodeContract,
  type ServiceBusinessConfidenceFlagContract,
  type ServiceBusinessMetricsContract,
  type ServiceBusinessMetricsQueryContract,
} from "./service-business-metrics.js";
export {
  CUSTOMER_SERVICE_SUBSCRIPTION_CONTRACT_VERSION,
  type CreateCustomerServiceSubscriptionRequest,
  type CreateServicePlanRequest,
  type CustomerServiceSubscriptionContract,
  type CustomerSubscriptionLifecycleActionRequest,
  type RecurrenceRuleContract,
  type ServicePlanContract,
  type SubscriptionSchedulePreviewContract,
  type UpdateCustomerServiceSubscriptionRequest,
  type UpdateServicePlanRequest,
} from "./customer-service-subscriptions.js";
