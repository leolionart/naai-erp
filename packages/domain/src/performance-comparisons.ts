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

const required = (value: string, label: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
};

const isoDate = (value: string, label: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must be an ISO date`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value)
    throw new Error(`${label} must be an ISO date`);
  return value;
};

const timestamp = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || !value.includes("T"))
    throw new Error("Performance as-of instant must be an ISO timestamp");
  return parsed;
};

const localDate = (instant: Date, timezone: "Asia/Ho_Chi_Minh") => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

const utc = (value: string) => new Date(`${value}T00:00:00.000Z`);
const dateString = (value: Date) => value.toISOString().slice(0, 10);
const daysInclusive = (startsOn: string, endsOn: string) =>
  Math.floor((utc(endsOn).valueOf() - utc(startsOn).valueOf()) / 86_400_000) + 1;

function shiftMonthClamped(value: string, months: number) {
  const source = utc(value);
  const targetYear = source.getUTCFullYear();
  const targetMonth = source.getUTCMonth() + months;
  const last = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return dateString(
    new Date(Date.UTC(targetYear, targetMonth, Math.min(source.getUTCDate(), last))),
  );
}

function shiftYearClamped(value: string, years: number) {
  const source = utc(value);
  const year = source.getUTCFullYear() + years;
  const month = source.getUTCMonth();
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return dateString(new Date(Date.UTC(year, month, Math.min(source.getUTCDate(), last))));
}

const dayOfMonth = (value: string) => Number(value.slice(8, 10));

function uniqueIds(values: readonly string[], label = "Performance source ID") {
  return Object.freeze(
    [...new Set(values.map((value) => required(value, label)))].sort((a, b) => a.localeCompare(b)),
  );
}

function normalizeAmount(input: PerformanceAmount, label: string): PerformanceAmount {
  if (!(["available", "missing"] as const).includes(input.status))
    throw new Error(`${label} status is invalid`);
  const sourceIds = uniqueIds(input.sourceIds);
  if (input.status === "available") {
    if (input.amountMinor === undefined) throw new Error(`${label} available amount is required`);
    if (input.reason) throw new Error(`${label} available amount cannot have a missing reason`);
  } else {
    if (input.amountMinor !== undefined) throw new Error(`${label} missing amount must be absent`);
    required(input.reason ?? "", `${label} missing reason`);
  }
  const window = input.window
    ? Object.freeze({
        startsOn: isoDate(input.window.startsOn, `${label} window start`),
        endsOn: isoDate(input.window.endsOn, `${label} window end`),
      })
    : undefined;
  if (window && window.startsOn > window.endsOn) throw new Error(`${label} window is invalid`);
  return Object.freeze({
    status: input.status,
    ...(input.amountMinor === undefined ? {} : { amountMinor: input.amountMinor }),
    ...(input.reason ? { reason: required(input.reason, `${label} reason`) } : {}),
    sourceIds,
    ...(window ? { window } : {}),
  });
}

function divideHalfAwayFromZero(numerator: bigint, denominator: bigint) {
  if (denominator <= 0n) throw new Error("Performance denominator must be positive");
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const quotient = (absolute * 2n + denominator) / (denominator * 2n);
  return negative ? -quotient : quotient;
}

function divideSignedHalfAwayFromZero(numerator: bigint, denominator: bigint) {
  if (denominator === 0n) throw new Error("Performance denominator cannot be zero");
  return denominator < 0n
    ? divideHalfAwayFromZero(-numerator, -denominator)
    : divideHalfAwayFromZero(numerator, denominator);
}

function safeNumber(value: bigint) {
  const result = Number(value);
  if (!Number.isSafeInteger(result))
    throw new Error("Performance ratio exceeds safe integer range");
  return result;
}

export function prorateTargetInclusive(
  fullTargetMinor: bigint,
  elapsedDays: number,
  periodDays: number,
) {
  if (!Number.isSafeInteger(elapsedDays) || !Number.isSafeInteger(periodDays))
    throw new Error("Performance proration days must be safe integers");
  if (periodDays <= 0 || elapsedDays < 0 || elapsedDays > periodDays)
    throw new Error("Performance proration days are invalid");
  return divideHalfAwayFromZero(fullTargetMinor * BigInt(elapsedDays), BigInt(periodDays));
}

function comparisonLine(
  basis: PerformanceComparisonBasis,
  numerator: PerformanceAmount,
  denominator: PerformanceAmount,
): PerformanceComparisonLine {
  if (numerator.status === "missing" || denominator.status === "missing") {
    return Object.freeze({
      basis,
      formulaVersion: PERFORMANCE_COMPARISON_FORMULA_VERSION,
      nullPolicyVersion: PERFORMANCE_NULL_POLICY_VERSION,
      status: "missing",
      reason:
        numerator.status === "missing"
          ? `numerator_missing:${numerator.reason}`
          : `denominator_missing:${denominator.reason}`,
      numeratorMinor: numerator.amountMinor ?? null,
      denominatorMinor: denominator.amountMinor ?? null,
      varianceMinor: null,
      ratioBps: null,
      varianceBps: null,
      numeratorSourceIds: numerator.sourceIds,
      denominatorSourceIds: denominator.sourceIds,
    });
  }
  const numeratorMinor = numerator.amountMinor!;
  const denominatorMinor = denominator.amountMinor!;
  const varianceMinor = numeratorMinor - denominatorMinor;
  if (denominatorMinor === 0n) {
    return Object.freeze({
      basis,
      formulaVersion: PERFORMANCE_COMPARISON_FORMULA_VERSION,
      nullPolicyVersion: PERFORMANCE_NULL_POLICY_VERSION,
      status: "zero_denominator",
      reason: "comparison_denominator_zero",
      numeratorMinor,
      denominatorMinor,
      varianceMinor,
      ratioBps: null,
      varianceBps: null,
      numeratorSourceIds: numerator.sourceIds,
      denominatorSourceIds: denominator.sourceIds,
    });
  }
  return Object.freeze({
    basis,
    formulaVersion: PERFORMANCE_COMPARISON_FORMULA_VERSION,
    nullPolicyVersion: PERFORMANCE_NULL_POLICY_VERSION,
    status: "available",
    numeratorMinor,
    denominatorMinor,
    varianceMinor,
    ratioBps: safeNumber(divideSignedHalfAwayFromZero(numeratorMinor * 10_000n, denominatorMinor)),
    varianceBps: safeNumber(
      divideSignedHalfAwayFromZero(varianceMinor * 10_000n, denominatorMinor),
    ),
    numeratorSourceIds: numerator.sourceIds,
    denominatorSourceIds: denominator.sourceIds,
  });
}

function window(
  startsOn: string,
  endsOn: string,
  comparisonType: PerformanceWindow["comparisonType"],
  derivation: PerformanceWindow["derivation"],
  unclampedEnd?: string,
): PerformanceWindow {
  return Object.freeze({
    startsOn,
    endsOn,
    dayCount: daysInclusive(startsOn, endsOn),
    comparisonType,
    derivation,
    clamped: Boolean(unclampedEnd && unclampedEnd !== endsOn),
  });
}

function dimensions(input?: PlanningDimensions): PlanningDimensions {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(input ?? {}).map(([key, value]) => [
        key,
        required(value, `Performance ${key}`),
      ]),
    ),
  );
}

export function buildPerformanceComparison(
  input: PerformanceComparisonInput,
): PerformanceComparison {
  if (!(["recognized", "invoiced", "collected"] as const).includes(input.actualBasis))
    throw new Error("Performance actual basis is invalid");
  if (input.timezone !== "Asia/Ho_Chi_Minh")
    throw new Error("Performance timezone must be Asia/Ho_Chi_Minh");
  const asOfInstant = timestamp(input.asOfInstant);
  const asOfLocalDate = localDate(asOfInstant, input.timezone);
  const period: PerformancePeriod = Object.freeze({
    basis: input.period.basis,
    kind: input.period.kind,
    id: required(input.period.id, "Performance period ID"),
    label: required(input.period.label, "Performance period label"),
    startsOn: isoDate(input.period.startsOn, "Performance period start"),
    endsOn: isoDate(input.period.endsOn, "Performance period end"),
    ...(input.period.fiscalYear === undefined ? {} : { fiscalYear: input.period.fiscalYear }),
    ...(input.period.fiscalPeriodNumber === undefined
      ? {}
      : { fiscalPeriodNumber: input.period.fiscalPeriodNumber }),
  });
  if (!(["calendar", "fiscal"] as const).includes(period.basis))
    throw new Error("Performance period basis is invalid");
  if (!(["month", "fiscal_period"] as const).includes(period.kind))
    throw new Error("Performance period kind is invalid");
  if (period.startsOn > period.endsOn) throw new Error("Performance period is invalid");
  if (asOfLocalDate < period.startsOn)
    throw new Error("Performance as-of local date must not precede period start");
  if (!/^[A-Z]{3}$/.test(input.currency.trim().toUpperCase()))
    throw new Error("Performance currency must be ISO-4217");
  if (period.basis === "fiscal") {
    if (
      !Number.isInteger(period.fiscalYear) ||
      !Number.isInteger(period.fiscalPeriodNumber) ||
      period.fiscalYear! < 1900 ||
      period.fiscalPeriodNumber! < 1
    )
      throw new Error("Fiscal performance period requires fiscal year and period number");
    if (!input.fiscalMomWindow || !input.fiscalYoyWindow)
      throw new Error("Fiscal performance comparisons require mapped MoM and YoY windows");
  } else if (period.fiscalYear !== undefined || period.fiscalPeriodNumber !== undefined) {
    throw new Error("Calendar performance period cannot include fiscal identifiers");
  } else if (period.kind === "fiscal_period") {
    throw new Error("Calendar performance period cannot use fiscal_period kind");
  }
  if (period.basis === "fiscal" && period.kind !== "fiscal_period")
    throw new Error("Fiscal performance period must use fiscal_period kind");
  const effectiveAsOf = asOfLocalDate > period.endsOn ? period.endsOn : asOfLocalDate;
  const currentWindow = window(period.startsOn, effectiveAsOf, "current", "as_of");
  const fiscalWindow = (
    value: Readonly<{ startsOn: string; endsOn: string }>,
    type: "mom" | "yoy",
  ) => {
    const startsOn = isoDate(value.startsOn, `Fiscal ${type} window start`);
    const endsOn = isoDate(value.endsOn, `Fiscal ${type} window end`);
    if (startsOn > endsOn) throw new Error(`Fiscal ${type} window is invalid`);
    return window(startsOn, endsOn, type, "fiscal_mapping");
  };
  const momUnclamped = shiftMonthClamped(currentWindow.endsOn, -1);
  const momStart = shiftMonthClamped(currentWindow.startsOn, -1);
  const momEndBoundary = dateString(
    new Date(Date.UTC(Number(momStart.slice(0, 4)), Number(momStart.slice(5, 7)), 0)),
  );
  const momEnd = momUnclamped > momEndBoundary ? momEndBoundary : momUnclamped;
  const momWasClamped = dayOfMonth(currentWindow.endsOn) !== dayOfMonth(momEnd);
  const yoyUnclamped = shiftYearClamped(currentWindow.endsOn, -1);
  const yoyStart = shiftYearClamped(currentWindow.startsOn, -1);
  const yoyWasClamped = dayOfMonth(currentWindow.endsOn) !== dayOfMonth(yoyUnclamped);
  const momWindow =
    period.basis === "fiscal"
      ? fiscalWindow(input.fiscalMomWindow!, "mom")
      : window(momStart, momEnd, "mom", "calendar_shift", momWasClamped ? "clamped" : momEnd);
  const yoyWindow =
    period.basis === "fiscal"
      ? fiscalWindow(input.fiscalYoyWindow!, "yoy")
      : window(
          yoyStart,
          yoyUnclamped,
          "yoy",
          "calendar_shift",
          yoyWasClamped ? "clamped" : yoyUnclamped,
        );
  const actual = normalizeAmount(input.actualToDate, "Actual-to-date");
  const target = normalizeAmount(input.fullTarget, "Full target");
  const forecast = normalizeAmount(input.fullPeriodForecast, "Full-period forecast");
  const mom = normalizeAmount(input.previousPeriodComparable, "MoM comparison");
  const yoy = normalizeAmount(input.priorYearComparable, "YoY comparison");
  for (const [amount, expected, label] of [
    [actual, currentWindow, "Actual-to-date"],
    [mom, momWindow, "MoM comparison"],
    [yoy, yoyWindow, "YoY comparison"],
  ] as const) {
    if (
      amount.window &&
      (amount.window.startsOn !== expected.startsOn || amount.window.endsOn !== expected.endsOn)
    )
      throw new Error(`${label} window does not match the comparable window`);
  }
  const periodDays = daysInclusive(period.startsOn, period.endsOn);
  const elapsedDays = currentWindow.dayCount;
  const proratedTargetMinor =
    target.status === "available"
      ? prorateTargetInclusive(target.amountMinor!, elapsedDays, periodDays)
      : null;
  const proratedTarget: PerformanceAmount =
    proratedTargetMinor === null
      ? target
      : Object.freeze({
          status: "available",
          amountMinor: proratedTargetMinor,
          sourceIds: target.sourceIds,
        });
  const actualVsProratedTarget = comparisonLine(
    "actual_vs_prorated_target",
    actual,
    proratedTarget,
  );
  const actualVsFullTarget = comparisonLine("actual_vs_full_target", actual, target);
  const actualVsRetainedForecast = comparisonLine("actual_vs_retained_forecast", actual, forecast);
  const forecastVsFullTarget = comparisonLine("forecast_vs_full_target", forecast, target);
  const monthOverMonth = comparisonLine("month_over_month", actual, mom);
  const yearOverYear = comparisonLine("year_over_year", actual, yoy);
  const confidenceFlags: PerformanceConfidenceFlag[] = [];
  const flag = (
    code: PerformanceConfidenceFlag["code"],
    severity: PerformanceConfidenceFlag["severity"],
    reason: string,
    sourceIds: readonly string[],
  ) =>
    confidenceFlags.push(
      Object.freeze({ code, severity, reason, sourceIds: uniqueIds(sourceIds) }),
    );
  if (effectiveAsOf !== asOfLocalDate)
    flag(
      "as_of_clamped_to_period",
      "info",
      `Local as-of ${asOfLocalDate} was clamped to ${effectiveAsOf}`,
      actual.sourceIds,
    );
  if (momWindow.clamped || yoyWindow.clamped)
    flag(
      "comparison_window_clamped",
      "info",
      "A comparable date was clamped to the last valid day of its month or year",
      [...mom.sourceIds, ...yoy.sourceIds],
    );
  if (target.status === "missing")
    flag("missing_target", "warning", target.reason!, target.sourceIds);
  if (forecast.status === "missing")
    flag("missing_forecast", "warning", forecast.reason!, forecast.sourceIds);
  if (mom.status === "missing")
    flag("missing_mom_comparison", "warning", mom.reason!, mom.sourceIds);
  if (yoy.status === "missing")
    flag("missing_yoy_comparison", "warning", yoy.reason!, yoy.sourceIds);
  if (target.status === "available" && target.amountMinor === 0n)
    flag("zero_target_denominator", "warning", "Published target is zero", target.sourceIds);
  if (mom.status === "available" && mom.amountMinor === 0n)
    flag("zero_mom_denominator", "warning", "Previous comparable amount is zero", mom.sourceIds);
  if (yoy.status === "available" && yoy.amountMinor === 0n)
    flag("zero_yoy_denominator", "warning", "Prior-year comparable amount is zero", yoy.sourceIds);
  const allSources = uniqueIds([
    ...actual.sourceIds,
    ...target.sourceIds,
    ...forecast.sourceIds,
    ...mom.sourceIds,
    ...yoy.sourceIds,
  ]);
  return Object.freeze({
    organizationId: required(input.organizationId, "Performance organization ID"),
    metricKey: required(input.metricKey, "Performance metric key"),
    actualBasis: input.actualBasis,
    currency: required(input.currency, "Performance currency").toUpperCase(),
    timezone: input.timezone,
    asOfInstant: input.asOfInstant,
    asOfLocalDate,
    period,
    dimensions: dimensions(input.dimensions),
    formulaVersion: PERFORMANCE_COMPARISON_FORMULA_VERSION,
    prorationFormulaVersion: PERFORMANCE_PRORATION_FORMULA_VERSION,
    windowFormulaVersion: PERFORMANCE_WINDOW_FORMULA_VERSION,
    nullPolicyVersion: PERFORMANCE_NULL_POLICY_VERSION,
    currentWindow,
    momWindow,
    yoyWindow,
    elapsedDays,
    periodDays,
    proratedTargetMinor,
    actualVsProratedTarget,
    actualVsFullTarget,
    actualVsRetainedForecast,
    forecastVsFullTarget,
    monthOverMonth,
    yearOverYear,
    sourceIds: allSources,
    confidenceFlags: Object.freeze(confidenceFlags),
  });
}
