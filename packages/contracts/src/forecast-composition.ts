import type { MutationMetadata } from "./index.js";
import type { PlanningDimensionsContract } from "./planning.js";

export const FORECAST_COMPOSITION_CONTRACT_VERSION = 1 as const;

export type ForecastComponentSectionContract = "revenue" | "expense" | "cash";
export type ForecastComponentKindContract =
  | "committed_milestone"
  | "scheduled_recurring"
  | "weighted_pipeline"
  | "manual_adjustment"
  | "payroll"
  | "recurring_opex"
  | "opening_cash"
  | "expected_collection"
  | "financing"
  | "ap_due"
  | "recurring_expense"
  | "tax"
  | "capex";
export type ForecastComponentDirectionContract = "increase" | "decrease";
export type ForecastComponentStateContract = "active" | "excluded";
export type ForecastComponentReviewStateContract = "not_required" | "pending" | "reviewed";
export type ForecastSourceTypeContract =
  | "milestone"
  | "recurring_schedule"
  | "opportunity"
  | "manual"
  | "bank_balance"
  | "receivable"
  | "financing"
  | "owner_funding"
  | "payroll_schedule"
  | "payable"
  | "tax_schedule"
  | "capex_schedule";

export type ForecastSourceIdentityContract = Readonly<{
  type: ForecastSourceTypeContract;
  id: string;
  commercialRootType?: string;
  commercialRootId?: string;
}>;

export type ForecastSourceSnapshotContract = Readonly<
  Record<string, string | number | boolean | null>
>;

export type ForecastComponentContract = Readonly<{
  schemaVersion: typeof FORECAST_COMPOSITION_CONTRACT_VERSION;
  id: string;
  forecastVersionId: string;
  section: ForecastComponentSectionContract;
  kind: ForecastComponentKindContract;
  direction: ForecastComponentDirectionContract;
  scheduledOn: string;
  amountMinor: string;
  probabilityBps: number;
  weightedAmountMinor: string;
  currency: string;
  source: ForecastSourceIdentityContract;
  sourceSnapshot: ForecastSourceSnapshotContract;
  dimensions: PlanningDimensionsContract;
  note?: string;
  state: ForecastComponentStateContract;
  reviewState: ForecastComponentReviewStateContract;
  createdBy: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewReason?: string;
  excludedBy?: string;
  excludedAt?: string;
  exclusionReason?: string;
  resourceVersion: string;
  nextActions: readonly string[];
}>;

export type CreateForecastComponentRequest = Readonly<{
  schemaVersion: typeof FORECAST_COMPOSITION_CONTRACT_VERSION;
  id?: string;
  section: ForecastComponentSectionContract;
  kind: ForecastComponentKindContract;
  direction: ForecastComponentDirectionContract;
  scheduledOn: string;
  amountMinor: string;
  probabilityBps?: number;
  currency: string;
  source: ForecastSourceIdentityContract;
  sourceSnapshot?: ForecastSourceSnapshotContract;
  dimensions?: PlanningDimensionsContract;
  note?: string;
  reason: string;
}>;

export type UpdateForecastComponentRequest = Readonly<{
  schemaVersion: typeof FORECAST_COMPOSITION_CONTRACT_VERSION;
  expectedResourceVersion: string;
  scheduledOn?: string;
  amountMinor?: string;
  probabilityBps?: number;
  sourceSnapshot?: ForecastSourceSnapshotContract;
  dimensions?: PlanningDimensionsContract;
  note?: string;
  reason: string;
}>;

export type ForecastComponentTransitionRequest = Readonly<{
  schemaVersion: typeof FORECAST_COMPOSITION_CONTRACT_VERSION;
  expectedResourceVersion: string;
  reason: string;
}>;

export type ForecastComponentListQueryContract = Readonly<{
  section?: ForecastComponentSectionContract;
  kind?: ForecastComponentKindContract;
  state?: ForecastComponentStateContract;
  reviewState?: ForecastComponentReviewStateContract;
  scheduledFrom?: string;
  scheduledTo?: string;
  sourceType?: ForecastSourceTypeContract;
  cursor?: string;
  limit?: number;
}>;

export type ForecastCompositionContract = Readonly<{
  schemaVersion: typeof FORECAST_COMPOSITION_CONTRACT_VERSION;
  organizationId: string;
  forecastVersionId: string;
  formulaVersion: "forecast-composition-v1";
  actualBasis: "recognized" | "invoiced" | "collected";
  asOfDate: string;
  startsOn: string;
  endsOn: string;
  currency: string;
  actualToDateMinor: string;
  committedMilestonesMinor: string;
  scheduledRecurringRevenueMinor: string;
  weightedPipelineMinor: string;
  manualRevenueAdjustmentMinor: string;
  projectedRevenueMinor: string;
  payrollExpenseMinor: string;
  recurringOpexMinor: string;
  manualExpenseAdjustmentMinor: string;
  projectedExpenseMinor: string;
  openingCashMinor: string;
  expectedCollectionsMinor: string;
  financingMinor: string;
  payrollCashOutMinor: string;
  apDueMinor: string;
  recurringExpenseCashOutMinor: string;
  taxCashOutMinor: string;
  capexCashOutMinor: string;
  manualCashAdjustmentMinor: string;
  projectedClosingCashMinor: string;
  componentIds: readonly string[];
  sourceIds: readonly string[];
  components: readonly ForecastComponentContract[];
  confidenceFlags: readonly Readonly<{
    code: "pending_manual_review" | "missing_opening_cash" | "duplicate_source";
    severity: "warning" | "critical";
    componentIds: readonly string[];
  }>[];
}>;

export type ForecastComponentMutationResult = Readonly<{
  resource: ForecastComponentContract;
  mutation: MutationMetadata;
}>;
