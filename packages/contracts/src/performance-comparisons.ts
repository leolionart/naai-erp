import type { ActualBasisContract, PlanningDimensionsContract } from "./planning.js";

export const PERFORMANCE_COMPARISON_CONTRACT_VERSION = 1 as const;
export const PERFORMANCE_COMPARISON_FORMULA_VERSION = "performance-comparison-v1" as const;
export const PERFORMANCE_PRORATION_FORMULA_VERSION = "inclusive-calendar-day-proration-v1" as const;
export const PERFORMANCE_WINDOW_FORMULA_VERSION = "comparable-window-v1" as const;
export const PERFORMANCE_NULL_POLICY_VERSION = "ratio-null-policy-v1" as const;

export type PerformancePeriodBasisContract = "calendar" | "fiscal";
export type PerformancePeriodKindContract = "month" | "fiscal_period";
export type PerformanceAmountStatusContract = "available" | "missing";
export type PerformanceResultStatusContract = "available" | "missing" | "zero_denominator";
export type PerformanceComparisonBasisContract =
  | "actual_vs_prorated_target"
  | "actual_vs_full_target"
  | "actual_vs_retained_forecast"
  | "forecast_vs_full_target"
  | "month_over_month"
  | "year_over_year";

export type PerformancePeriodContract = Readonly<{
  basis: PerformancePeriodBasisContract;
  kind: PerformancePeriodKindContract;
  id: string;
  label: string;
  startsOn: string;
  endsOn: string;
  fiscalYear?: number;
  fiscalPeriodNumber?: number;
}>;

export type PerformanceWindowContract = Readonly<{
  startsOn: string;
  endsOn: string;
  dayCount: number;
  comparisonType: "current" | "mom" | "yoy";
  derivation: "as_of" | "calendar_shift" | "fiscal_mapping";
  clamped: boolean;
}>;

export type PerformanceAmountContract = Readonly<{
  status: PerformanceAmountStatusContract;
  amountMinor?: string;
  reason?: string;
  sourceIds: readonly string[];
  window?: Readonly<{ startsOn: string; endsOn: string }>;
}>;

export type BuildPerformanceComparisonRequest = Readonly<{
  schemaVersion: typeof PERFORMANCE_COMPARISON_CONTRACT_VERSION;
  organizationId: string;
  metricKey: string;
  actualBasis: ActualBasisContract;
  currency: string;
  timezone: "Asia/Ho_Chi_Minh";
  asOfInstant: string;
  period: PerformancePeriodContract;
  dimensions?: PlanningDimensionsContract;
  actualToDate: PerformanceAmountContract;
  fullTarget: PerformanceAmountContract;
  fullPeriodForecast: PerformanceAmountContract;
  previousPeriodComparable: PerformanceAmountContract;
  priorYearComparable: PerformanceAmountContract;
  fiscalMomWindow?: Readonly<{ startsOn: string; endsOn: string }>;
  fiscalYoyWindow?: Readonly<{ startsOn: string; endsOn: string }>;
}>;

export type PerformanceComparisonLineContract = Readonly<{
  basis: PerformanceComparisonBasisContract;
  formulaVersion: typeof PERFORMANCE_COMPARISON_FORMULA_VERSION;
  nullPolicyVersion: typeof PERFORMANCE_NULL_POLICY_VERSION;
  status: PerformanceResultStatusContract;
  reason?: string;
  numeratorMinor: string | null;
  denominatorMinor: string | null;
  varianceMinor: string | null;
  ratioBps: number | null;
  varianceBps: number | null;
  numeratorSourceIds: readonly string[];
  denominatorSourceIds: readonly string[];
}>;

export type PerformanceConfidenceFlagContract = Readonly<{
  code:
    | "as_of_clamped_to_period"
    | "comparison_window_clamped"
    | "missing_target"
    | "missing_forecast"
    | "missing_mom_comparison"
    | "missing_yoy_comparison"
    | "zero_target_denominator"
    | "zero_mom_denominator"
    | "zero_yoy_denominator";
  severity: "info" | "warning";
  reason: string;
  sourceIds: readonly string[];
}>;

export type PerformanceComparisonContract = Readonly<{
  schemaVersion: typeof PERFORMANCE_COMPARISON_CONTRACT_VERSION;
  organizationId: string;
  metricKey: string;
  actualBasis: ActualBasisContract;
  currency: string;
  timezone: "Asia/Ho_Chi_Minh";
  asOfInstant: string;
  asOfLocalDate: string;
  period: PerformancePeriodContract;
  dimensions: PlanningDimensionsContract;
  formulaVersion: typeof PERFORMANCE_COMPARISON_FORMULA_VERSION;
  prorationFormulaVersion: typeof PERFORMANCE_PRORATION_FORMULA_VERSION;
  windowFormulaVersion: typeof PERFORMANCE_WINDOW_FORMULA_VERSION;
  nullPolicyVersion: typeof PERFORMANCE_NULL_POLICY_VERSION;
  currentWindow: PerformanceWindowContract;
  momWindow: PerformanceWindowContract;
  yoyWindow: PerformanceWindowContract;
  elapsedDays: number;
  periodDays: number;
  proratedTargetMinor: string | null;
  actualVsProratedTarget: PerformanceComparisonLineContract;
  actualVsFullTarget: PerformanceComparisonLineContract;
  actualVsRetainedForecast: PerformanceComparisonLineContract;
  forecastVsFullTarget: PerformanceComparisonLineContract;
  monthOverMonth: PerformanceComparisonLineContract;
  yearOverYear: PerformanceComparisonLineContract;
  sourceIds: readonly string[];
  confidenceFlags: readonly PerformanceConfidenceFlagContract[];
}>;
