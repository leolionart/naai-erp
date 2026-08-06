export const EXECUTIVE_METRICS_CONTRACT_VERSION = 1 as const;
export const EXECUTIVE_METRICS_FORMULA_VERSION = "executive-metrics-v1" as const;
export const PROFITABILITY_RATIO_FORMULA_VERSION = "signed-revenue-profitability-v1" as const;
export const RETURN_RATIO_FORMULA_VERSION = "positive-average-return-v1" as const;
export const EQUITY_CONSUMED_FORMULA_VERSION =
  "accumulated-loss-over-contributed-capital-v1" as const;
export const EQUITY_ROLL_FORWARD_CONTROL_VERSION = "equity-roll-forward-control-v1" as const;
export const OPERATING_BURN_FORMULA_VERSION = "signed-average-operating-cash-flow-v1" as const;
export const RUNWAY_FORMULA_VERSION = "unrestricted-cash-over-reviewed-net-burn-v1" as const;
export const PURPOSE_SPECIFIC_ROI_FORMULA_VERSION = "purpose-specific-roi-v1" as const;

export type ExecutiveMetricStatusContract =
  "available" | "zero_denominator" | "non_positive_denominator";
export type ExecutiveRatioContract = Readonly<{
  status: ExecutiveMetricStatusContract;
  formulaVersion: string;
  numeratorMinor: string;
  denominatorMinor: string;
  valueBps: number | null;
  reason?: string;
}>;
export type ExecutiveMetricQueryContract = Readonly<{
  periodId?: string;
  startsOn?: string;
  endsOn?: string;
  asOfDate?: string;
  teamId?: string;
  serviceLineCode?: string;
  ownerId?: string;
  projectId?: string;
}>;
export type ExecutiveMetricPeriodContract = Readonly<{
  startsOn: string;
  endsOn: string;
  asOfDate: string;
}>;
export type ExecutiveSourceBoundaryContract = Readonly<{
  ledgerCutoffFingerprint: string;
  sourceIds: readonly string[];
}>;
export type PurposeSpecificRoiContract = Readonly<{
  id: string;
  purpose: "project" | "marketing" | "custom";
  label: string;
  benefitMinor: string;
  includedCostMinor: string;
  returnMinor: string;
  policyVersionId: string;
  sourceIds: readonly string[];
  formulaVersion: typeof PURPOSE_SPECIFIC_ROI_FORMULA_VERSION;
  ratio: ExecutiveRatioContract;
}>;
export type ExecutiveMetricsContract = Readonly<{
  schemaVersion: typeof EXECUTIVE_METRICS_CONTRACT_VERSION;
  organizationId: string;
  currency: string;
  period: ExecutiveMetricPeriodContract;
  dimensions: Readonly<Record<string, string>>;
  sourceBoundary: ExecutiveSourceBoundaryContract;
  formulaVersion: typeof EXECUTIVE_METRICS_FORMULA_VERSION;
  grossMargin: ExecutiveRatioContract;
  operatingMargin: ExecutiveRatioContract;
  netMargin: ExecutiveRatioContract;
  ros: ExecutiveRatioContract;
  roe: ExecutiveRatioContract;
  roa: ExecutiveRatioContract;
  accumulatedLossMinor: string;
  contributedCapitalMinor: string;
  ownerLoansMinor: string;
  equityConsumed: ExecutiveRatioContract;
  equityRollForward: Readonly<{
    controlVersion: typeof EQUITY_ROLL_FORWARD_CONTROL_VERSION;
    openingEquityMinor: string;
    contributionsMinor: string;
    withdrawalsMinor: string;
    profitOrLossMinor: string;
    reviewedAdjustmentsMinor: string;
    expectedClosingEquityMinor: string;
    actualClosingEquityMinor: string;
    differenceMinor: string;
    status: "tied_out" | "difference";
  }>;
  burnFormulaVersion: typeof OPERATING_BURN_FORMULA_VERSION;
  averageOperatingNetCashFlowMinor: string | null;
  netBurnMinor: string | null;
  unrestrictedCashMinor: string;
  restrictedCashMinor: string;
  runwayFormulaVersion: typeof RUNWAY_FORMULA_VERSION;
  runwayMonthsThousandths: string | null;
  runwayStatus: "available" | "cash_generating" | "missing_reviewed_burn";
  roi: readonly PurposeSpecificRoiContract[];
}>;
