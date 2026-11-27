import type { ActualBasis, PlanningDimensions } from "./planning.js";

export const PERFORMANCE_COMPARISON_FORMULA_VERSION = "performance-comparison-v1" as const;
export const PERFORMANCE_PRORATION_FORMULA_VERSION = "inclusive-calendar-day-proration-v1" as const;
export const PERFORMANCE_WINDOW_FORMULA_VERSION = "comparable-window-v1" as const;
export const PERFORMANCE_NULL_POLICY_VERSION = "ratio-null-policy-v1" as const;

export type PerformancePeriodBasis = "calendar" | "fiscal";
export type PerformancePeriodKind = "month" | "fiscal_period";
export type PerformanceAmountStatus = "available" | "missing";
export type PerformanceResultStatus = "available" | "missing" | "zero_denominator";
export type PerformanceComparisonBasis =
  | "actual_vs_prorated_target"
  | "actual_vs_full_target"
  | "actual_vs_retained_forecast"
  | "forecast_vs_full_target"
  | "month_over_month"
  | "year_over_year";

export type PerformancePeriod = Readonly<{
  basis: PerformancePeriodBasis;
  kind: PerformancePeriodKind;
  id: string;
  label: string;
  startsOn: string;
  endsOn: string;
  fiscalYear?: number;
  fiscalPeriodNumber?: number;
}>;

export type PerformanceWindow = Readonly<{
  startsOn: string;
  endsOn: string;
  dayCount: number;
  comparisonType: "current" | "mom" | "yoy";
  derivation: "as_of" | "calendar_shift" | "fiscal_mapping";
  clamped: boolean;
}>;

export type PerformanceAmount = Readonly<{
  status: PerformanceAmountStatus;
  amountMinor?: bigint;
  reason?: string;
  sourceIds: readonly string[];
  window?: Readonly<{ startsOn: string; endsOn: string }>;
}>;

export type PerformanceComparisonLine = Readonly<{
  basis: PerformanceComparisonBasis;
  formulaVersion: typeof PERFORMANCE_COMPARISON_FORMULA_VERSION;
  nullPolicyVersion: typeof PERFORMANCE_NULL_POLICY_VERSION;
  status: PerformanceResultStatus;
  reason?: string;
  numeratorMinor: bigint | null;
  denominatorMinor: bigint | null;
  varianceMinor: bigint | null;
  ratioBps: number | null;
  varianceBps: number | null;
  numeratorSourceIds: readonly string[];
  denominatorSourceIds: readonly string[];
}>;

export type PerformanceConfidenceFlag = Readonly<{
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

export type PerformanceComparisonInput = Readonly<{
  organizationId: string;
  metricKey: string;
  actualBasis: ActualBasis;
  currency: string;
  timezone: "Asia/Ho_Chi_Minh";
  asOfInstant: string;
  period: PerformancePeriod;
  dimensions?: PlanningDimensions;
  actualToDate: PerformanceAmount;
  fullTarget: PerformanceAmount;
  fullPeriodForecast: PerformanceAmount;
  previousPeriodComparable: PerformanceAmount;
  priorYearComparable: PerformanceAmount;
  fiscalMomWindow?: Readonly<{ startsOn: string; endsOn: string }>;
  fiscalYoyWindow?: Readonly<{ startsOn: string; endsOn: string }>;
}>;

export type PerformanceComparison = Readonly<{
  organizationId: string;
  metricKey: string;
  actualBasis: ActualBasis;
  currency: string;
  timezone: "Asia/Ho_Chi_Minh";
  asOfInstant: string;
  asOfLocalDate: string;
  period: PerformancePeriod;
  dimensions: PlanningDimensions;
  formulaVersion: typeof PERFORMANCE_COMPARISON_FORMULA_VERSION;
  prorationFormulaVersion: typeof PERFORMANCE_PRORATION_FORMULA_VERSION;
  windowFormulaVersion: typeof PERFORMANCE_WINDOW_FORMULA_VERSION;
  nullPolicyVersion: typeof PERFORMANCE_NULL_POLICY_VERSION;
  currentWindow: PerformanceWindow;
  momWindow: PerformanceWindow;
  yoyWindow: PerformanceWindow;
  elapsedDays: number;
  periodDays: number;
  proratedTargetMinor: bigint | null;
  actualVsProratedTarget: PerformanceComparisonLine;
  actualVsFullTarget: PerformanceComparisonLine;
  actualVsRetainedForecast: PerformanceComparisonLine;
  forecastVsFullTarget: PerformanceComparisonLine;
  monthOverMonth: PerformanceComparisonLine;
  yearOverYear: PerformanceComparisonLine;
  sourceIds: readonly string[];
  confidenceFlags: readonly PerformanceConfidenceFlag[];
}>;
