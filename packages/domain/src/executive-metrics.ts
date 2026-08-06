export const EXECUTIVE_METRICS_FORMULA_VERSION = "executive-metrics-v1" as const;
export const PROFITABILITY_RATIO_FORMULA_VERSION = "signed-revenue-profitability-v1" as const;
export const RETURN_RATIO_FORMULA_VERSION = "positive-average-return-v1" as const;
export const EQUITY_CONSUMED_FORMULA_VERSION =
  "accumulated-loss-over-contributed-capital-v1" as const;
export const EQUITY_ROLL_FORWARD_CONTROL_VERSION = "equity-roll-forward-control-v1" as const;
export const OPERATING_BURN_FORMULA_VERSION = "signed-average-operating-cash-flow-v1" as const;
export const RUNWAY_FORMULA_VERSION = "unrestricted-cash-over-reviewed-net-burn-v1" as const;
export const PURPOSE_SPECIFIC_ROI_FORMULA_VERSION = "purpose-specific-roi-v1" as const;

export type ExecutiveMetricStatus = "available" | "zero_denominator" | "non_positive_denominator";
export type ExecutiveDimensions = Readonly<Record<string, string>>;
export type ExecutiveMetricPeriod = Readonly<{
  startsOn: string;
  endsOn: string;
  asOfDate: string;
}>;
export type ExecutiveSourceBoundary = Readonly<{
  ledgerCutoffFingerprint: string;
  sourceIds: readonly string[];
}>;

export type ExecutiveRatio = Readonly<{
  status: ExecutiveMetricStatus;
  formulaVersion: string;
  numeratorMinor: bigint;
  denominatorMinor: bigint;
  valueBps: number | null;
  reason?: string;
}>;

export type PurposeSpecificRoiInput = Readonly<{
  id: string;
  purpose: "project" | "marketing" | "custom";
  label: string;
  benefitMinor: bigint;
  includedCostMinor: bigint;
  policyVersionId: string;
  sourceIds: readonly string[];
}>;

export type PurposeSpecificRoi = PurposeSpecificRoiInput &
  Readonly<{
    formulaVersion: typeof PURPOSE_SPECIFIC_ROI_FORMULA_VERSION;
    returnMinor: bigint;
    ratio: ExecutiveRatio;
  }>;

export type ExecutiveMetricsInput = Readonly<{
  organizationId: string;
  policyVersionId: string;
  currency: string;
  period: ExecutiveMetricPeriod;
  dimensions?: ExecutiveDimensions;
  sourceBoundary: ExecutiveSourceBoundary;
  revenueMinor: bigint;
  grossProfitMinor: bigint;
  operatingProfitMinor: bigint;
  netProfitMinor: bigint;
  openingEquityMinor: bigint;
  closingEquityMinor: bigint;
  contributionsMinor: bigint;
  withdrawalsMinor: bigint;
  reviewedEquityAdjustmentsMinor: bigint;
  openingAssetsMinor: bigint;
  closingAssetsMinor: bigint;
  retainedEarningsMinor: bigint;
  contributedCapitalMinor: bigint;
  ownerLoansMinor: bigint;
  unrestrictedCashMinor: bigint;
  restrictedCashMinor: bigint;
  reviewedOperatingNetCashFlowMinor: readonly bigint[];
  roi: readonly PurposeSpecificRoiInput[];
}>;

export type ExecutiveMetrics = Readonly<{
  organizationId: string;
  policyVersionId: string;
  currency: string;
  period: ExecutiveMetricPeriod;
  dimensions: ExecutiveDimensions;
  sourceBoundary: ExecutiveSourceBoundary;
  formulaVersion: typeof EXECUTIVE_METRICS_FORMULA_VERSION;
  grossMargin: ExecutiveRatio;
  operatingMargin: ExecutiveRatio;
  netMargin: ExecutiveRatio;
  ros: ExecutiveRatio;
  roe: ExecutiveRatio;
  roa: ExecutiveRatio;
  accumulatedLossMinor: bigint;
  contributedCapitalMinor: bigint;
  ownerLoansMinor: bigint;
  equityConsumed: ExecutiveRatio;
  equityRollForward: Readonly<{
    controlVersion: typeof EQUITY_ROLL_FORWARD_CONTROL_VERSION;
    openingEquityMinor: bigint;
    contributionsMinor: bigint;
    withdrawalsMinor: bigint;
    profitOrLossMinor: bigint;
    reviewedAdjustmentsMinor: bigint;
    expectedClosingEquityMinor: bigint;
    actualClosingEquityMinor: bigint;
    differenceMinor: bigint;
    status: "tied_out" | "difference";
  }>;
  burnFormulaVersion: typeof OPERATING_BURN_FORMULA_VERSION;
  averageOperatingNetCashFlowMinor: bigint | null;
  netBurnMinor: bigint | null;
  unrestrictedCashMinor: bigint;
  restrictedCashMinor: bigint;
  runwayFormulaVersion: typeof RUNWAY_FORMULA_VERSION;
  runwayMonthsThousandths: bigint | null;
  runwayStatus: "available" | "cash_generating" | "missing_reviewed_burn";
  roi: readonly PurposeSpecificRoi[];
}>;

const required = (value: string, label: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
};
const date = (value: string, label: string) => {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value
  )
    throw new Error(`${label} must be an ISO date`);
  return value;
};
const bps = (numerator: bigint, denominator: bigint) => Number((numerator * 10_000n) / denominator);
const signedRatio = (
  numerator: bigint,
  denominator: bigint,
  formulaVersion: string,
): ExecutiveRatio =>
  denominator === 0n
    ? Object.freeze({
        status: "zero_denominator",
        formulaVersion,
        numeratorMinor: numerator,
        denominatorMinor: denominator,
        valueBps: null,
        reason: "Signed denominator is zero",
      })
    : Object.freeze({
        status: "available",
        formulaVersion,
        numeratorMinor: numerator,
        denominatorMinor: denominator,
        valueBps: bps(numerator, denominator),
      });
const positiveRatio = (
  numerator: bigint,
  denominator: bigint,
  formulaVersion: string,
): ExecutiveRatio =>
  denominator <= 0n
    ? Object.freeze({
        status: "non_positive_denominator",
        formulaVersion,
        numeratorMinor: numerator,
        denominatorMinor: denominator,
        valueBps: null,
        reason: "Reviewed denominator must be positive",
      })
    : Object.freeze({
        status: "available",
        formulaVersion,
        numeratorMinor: numerator,
        denominatorMinor: denominator,
        valueBps: bps(numerator, denominator),
      });
const average = (opening: bigint, closing: bigint) => (opening + closing) / 2n;
const unique = (values: readonly string[]) =>
  Object.freeze(
    [...new Set(values.map((value) => required(value, "Executive metric source ID")))].sort(),
  );

export function buildExecutiveMetrics(input: ExecutiveMetricsInput): ExecutiveMetrics {
  const organizationId = required(input.organizationId, "Organization ID");
  const policyVersionId = required(input.policyVersionId, "Executive metric policy version ID");
  const currency = required(input.currency, "Currency").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must be ISO-4217");
  date(input.period.startsOn, "Executive metric start date");
  date(input.period.endsOn, "Executive metric end date");
  date(input.period.asOfDate, "Executive metric as-of date");
  if (input.period.startsOn > input.period.endsOn || input.period.endsOn > input.period.asOfDate)
    throw new Error("Executive metric period is invalid");
  if (!/^[0-9a-f]{64}$/.test(input.sourceBoundary.ledgerCutoffFingerprint))
    throw new Error("Executive metric ledger cutoff fingerprint must be SHA-256");
  for (const [label, value] of [
    ["Equity contributions", input.contributionsMinor],
    ["Equity withdrawals", input.withdrawalsMinor],
    ["Contributed capital", input.contributedCapitalMinor],
    ["Owner loans", input.ownerLoansMinor],
    ["Unrestricted cash", input.unrestrictedCashMinor],
    ["Restricted cash", input.restrictedCashMinor],
  ] as const)
    if (value < 0n) throw new Error(`${label} cannot be negative`);
  if (input.roi.some((item) => !["project", "marketing", "custom"].includes(item.purpose)))
    throw new Error("ROI must retain a supported purpose identity");
  const roiIds = input.roi.map((item) => required(item.id, "ROI ID"));
  if (new Set(roiIds).size !== roiIds.length) throw new Error("ROI IDs must be unique");

  const accumulatedLossMinor = input.retainedEarningsMinor < 0n ? -input.retainedEarningsMinor : 0n;
  const reviewedMonths = input.reviewedOperatingNetCashFlowMinor.length;
  const averageOperatingNetCashFlowMinor =
    reviewedMonths === 0
      ? null
      : input.reviewedOperatingNetCashFlowMinor.reduce((sum, value) => sum + value, 0n) /
        BigInt(reviewedMonths);
  const netBurnMinor =
    averageOperatingNetCashFlowMinor === null
      ? null
      : averageOperatingNetCashFlowMinor < 0n
        ? -averageOperatingNetCashFlowMinor
        : 0n;
  const runwayStatus =
    netBurnMinor === null
      ? "missing_reviewed_burn"
      : netBurnMinor === 0n
        ? "cash_generating"
        : "available";
  const runwayMonthsThousandths =
    netBurnMinor !== null && netBurnMinor > 0n
      ? (input.unrestrictedCashMinor * 1_000n) / netBurnMinor
      : null;
  const expectedClosingEquityMinor =
    input.openingEquityMinor +
    input.contributionsMinor -
    input.withdrawalsMinor +
    input.netProfitMinor +
    input.reviewedEquityAdjustmentsMinor;
  const equityDifferenceMinor = input.closingEquityMinor - expectedClosingEquityMinor;
  const roi = Object.freeze(
    input.roi.map((item) => {
      required(item.label, "ROI label");
      required(item.policyVersionId, "ROI policy version ID");
      const returnMinor = item.benefitMinor - item.includedCostMinor;
      return Object.freeze({
        ...item,
        id: required(item.id, "ROI ID"),
        sourceIds: unique(item.sourceIds),
        formulaVersion: PURPOSE_SPECIFIC_ROI_FORMULA_VERSION,
        returnMinor,
        ratio: positiveRatio(
          returnMinor,
          item.includedCostMinor,
          PURPOSE_SPECIFIC_ROI_FORMULA_VERSION,
        ),
      });
    }),
  );

  return Object.freeze({
    organizationId,
    policyVersionId,
    currency,
    period: Object.freeze({ ...input.period }),
    dimensions: Object.freeze({ ...(input.dimensions ?? {}) }),
    sourceBoundary: Object.freeze({
      ...input.sourceBoundary,
      sourceIds: unique(input.sourceBoundary.sourceIds),
    }),
    formulaVersion: EXECUTIVE_METRICS_FORMULA_VERSION,
    grossMargin: signedRatio(
      input.grossProfitMinor,
      input.revenueMinor,
      PROFITABILITY_RATIO_FORMULA_VERSION,
    ),
    operatingMargin: signedRatio(
      input.operatingProfitMinor,
      input.revenueMinor,
      PROFITABILITY_RATIO_FORMULA_VERSION,
    ),
    netMargin: signedRatio(
      input.netProfitMinor,
      input.revenueMinor,
      PROFITABILITY_RATIO_FORMULA_VERSION,
    ),
    ros: signedRatio(input.netProfitMinor, input.revenueMinor, PROFITABILITY_RATIO_FORMULA_VERSION),
    roe: positiveRatio(
      input.netProfitMinor,
      average(input.openingEquityMinor, input.closingEquityMinor),
      RETURN_RATIO_FORMULA_VERSION,
    ),
    roa: positiveRatio(
      input.netProfitMinor,
      average(input.openingAssetsMinor, input.closingAssetsMinor),
      RETURN_RATIO_FORMULA_VERSION,
    ),
    accumulatedLossMinor,
    contributedCapitalMinor: input.contributedCapitalMinor,
    ownerLoansMinor: input.ownerLoansMinor,
    equityConsumed: positiveRatio(
      accumulatedLossMinor,
      input.contributedCapitalMinor,
      EQUITY_CONSUMED_FORMULA_VERSION,
    ),
    equityRollForward: Object.freeze({
      controlVersion: EQUITY_ROLL_FORWARD_CONTROL_VERSION,
      openingEquityMinor: input.openingEquityMinor,
      contributionsMinor: input.contributionsMinor,
      withdrawalsMinor: input.withdrawalsMinor,
      profitOrLossMinor: input.netProfitMinor,
      reviewedAdjustmentsMinor: input.reviewedEquityAdjustmentsMinor,
      expectedClosingEquityMinor,
      actualClosingEquityMinor: input.closingEquityMinor,
      differenceMinor: equityDifferenceMinor,
      status: equityDifferenceMinor === 0n ? "tied_out" : "difference",
    }),
    burnFormulaVersion: OPERATING_BURN_FORMULA_VERSION,
    averageOperatingNetCashFlowMinor,
    netBurnMinor,
    unrestrictedCashMinor: input.unrestrictedCashMinor,
    restrictedCashMinor: input.restrictedCashMinor,
    runwayFormulaVersion: RUNWAY_FORMULA_VERSION,
    runwayMonthsThousandths,
    runwayStatus,
    roi,
  });
}
