export const ESTIMATED_CIT_FORMULA_VERSION = "estimated-cit-v1" as const;

export const CIT_TIER_SMALL_MAX_REVENUE_MINOR = 3_000_000_000n;
export const CIT_TIER_MEDIUM_MAX_REVENUE_MINOR = 50_000_000_000n;

export type CitRateTier = Readonly<{
  tierOrder: number;
  tierCode: string;
  label: string;
  maxRevenueMinor: bigint | null;
  rateBps: number;
}>;

export type CitRateSchedule = Readonly<{
  effectiveFromYear: number;
  effectiveToYear: number | null;
  lawReference: string;
  standardRateBps: number;
  source: "statutory" | "organization";
  tiers: readonly CitRateTier[];
}>;

export type CitRateBasis =
  | "prior_year_revenue"
  | "declared_prior_year_revenue"
  | "no_prior_year_revenue"
  | "ineligible_override"
  | "tax_code_policy"
  | "unconfigured";

export type ResolvedCitEstimate = Readonly<{
  formulaVersion: typeof ESTIMATED_CIT_FORMULA_VERSION;
  taxYear: number;
  priorYear: number;
  effectiveRateBps: number | null;
  tierCode: string | null;
  basis: CitRateBasis;
  assumption: string;
  lawReference: string | null;
  scheduleSource: "statutory" | "organization" | null;
  referenceRevenueMinor: bigint | null;
  priorYearLedgerRevenueMinor: bigint;
  hasPriorYearActivity: boolean;
  currentYearRevenueMinor: bigint;
  citSmallEnterpriseIneligible: boolean;
  ineligibilityReason: string | null;
  priorYearRevenueOverrideMinor: bigint | null;
  taxableProfitMinor: bigint;
  taxableBaseMinor: bigint;
  estimatedCitMinor: bigint | null;
  tiers: readonly CitRateTier[];
}>;

export const LAW_67_2025_CIT_SCHEDULE: CitRateSchedule = Object.freeze({
  effectiveFromYear: 2025,
  effectiveToYear: null,
  lawReference: "Law 67/2025/QH15",
  standardRateBps: 2000,
  source: "statutory",
  tiers: Object.freeze([
    Object.freeze({
      tierOrder: 1,
      tierCode: "small_15",
      label: "Doanh thu năm trước liền kề <= 3 tỷ đồng (15%)",
      maxRevenueMinor: CIT_TIER_SMALL_MAX_REVENUE_MINOR,
      rateBps: 1500,
    }),
    Object.freeze({
      tierOrder: 2,
      tierCode: "medium_17",
      label: "Doanh thu năm trước liền kề > 3 tỷ đồng đến <= 50 tỷ đồng (17%)",
      maxRevenueMinor: CIT_TIER_MEDIUM_MAX_REVENUE_MINOR,
      rateBps: 1700,
    }),
    Object.freeze({
      tierOrder: 3,
      tierCode: "standard_20",
      label: "Doanh thu năm trước liền kề > 50 tỷ đồng (20%)",
      maxRevenueMinor: null,
      rateBps: 2000,
    }),
  ]),
});

const formatMinorNumber = (value: bigint): string => {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${grouped} ₫`;
};

const formatRatePercent = (rateBps: number): string => {
  const whole = Math.trunc(rateBps / 100);
  const remainder = Math.abs(rateBps % 100);
  if (remainder === 0) return `${whole}%`;
  const decimals = String(remainder).padStart(2, "0").replace(/0+$/, "");
  return `${whole},${decimals}%`;
};

export function validateCitRateSchedule(schedule: CitRateSchedule): CitRateSchedule {
  if (
    !Number.isInteger(schedule.effectiveFromYear) ||
    schedule.effectiveFromYear < 1900 ||
    schedule.effectiveFromYear > 9999
  ) {
    throw new Error("CIT schedule effectiveFromYear must be a valid calendar year");
  }
  if (
    schedule.effectiveToYear !== null &&
    (!Number.isInteger(schedule.effectiveToYear) ||
      schedule.effectiveToYear < schedule.effectiveFromYear ||
      schedule.effectiveToYear > 9999)
  ) {
    throw new Error("CIT schedule effectiveToYear must be null or >= effectiveFromYear");
  }
  if (!schedule.lawReference.trim()) {
    throw new Error("CIT schedule lawReference is required");
  }
  if (!schedule.tiers.length) {
    throw new Error("CIT schedule requires at least one rate tier");
  }
  const sorted = [...schedule.tiers].sort((a, b) => a.tierOrder - b.tierOrder);
  let previousCap: bigint | null = null;
  for (let i = 0; i < sorted.length; i += 1) {
    const tier = sorted[i]!;
    if (!tier.tierCode.trim() || !tier.label.trim()) {
      throw new Error("CIT tier code and label are required");
    }
    if (!Number.isInteger(tier.rateBps) || tier.rateBps < 0 || tier.rateBps > 10_000) {
      throw new Error("CIT tier rateBps must be an integer between 0 and 10000");
    }
    const isLast = i === sorted.length - 1;
    if (isLast) {
      if (tier.maxRevenueMinor !== null) {
        throw new Error("Final CIT tier must be unbounded (maxRevenueMinor = null)");
      }
    } else {
      if (tier.maxRevenueMinor === null || tier.maxRevenueMinor < 0n) {
        throw new Error("Non-final CIT tiers must specify a non-negative maxRevenueMinor");
      }
      if (previousCap !== null && tier.maxRevenueMinor <= previousCap) {
        throw new Error("CIT tier maxRevenueMinor thresholds must be strictly increasing");
      }
      previousCap = tier.maxRevenueMinor;
    }
  }
  const lastTier = sorted[sorted.length - 1]!;
  return Object.freeze({
    ...schedule,
    lawReference: schedule.lawReference.trim(),
    standardRateBps: lastTier.rateBps,
    tiers: Object.freeze(sorted.map((tier) => Object.freeze({ ...tier }))),
  });
}

export function selectCitRateSchedule(
  taxYear: number,
  organizationSchedules: readonly CitRateSchedule[] = [],
  statutorySchedules: readonly CitRateSchedule[] = [LAW_67_2025_CIT_SCHEDULE],
): CitRateSchedule | null {
  if (!Number.isInteger(taxYear) || taxYear < 1900 || taxYear > 9999) {
    throw new Error("CIT taxYear must be a valid calendar year");
  }
  const covers = (item: CitRateSchedule) =>
    item.effectiveFromYear <= taxYear &&
    (item.effectiveToYear === null || item.effectiveToYear >= taxYear);

  const pickBest = (items: readonly CitRateSchedule[]) =>
    items
      .map(validateCitRateSchedule)
      .filter(covers)
      .sort((a, b) => b.effectiveFromYear - a.effectiveFromYear)[0] ?? null;

  return pickBest(organizationSchedules) ?? pickBest(statutorySchedules);
}

export function calculateEstimatedCitMinor(
  taxableProfitMinor: bigint,
  rateBps: number | null,
): Readonly<{ taxableBaseMinor: bigint; estimatedCitMinor: bigint | null }> {
  const taxableBaseMinor = taxableProfitMinor > 0n ? taxableProfitMinor : 0n;
  if (rateBps === null) {
    return Object.freeze({ taxableBaseMinor, estimatedCitMinor: null });
  }
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10_000) {
    throw new Error("CIT rateBps must be an integer between 0 and 10000");
  }
  const estimatedCitMinor =
    taxableBaseMinor === 0n ? 0n : (taxableBaseMinor * BigInt(rateBps) + 5_000n) / 10_000n;
  return Object.freeze({ taxableBaseMinor, estimatedCitMinor });
}

export function resolveEstimatedCit(
  input: Readonly<{
    taxYear: number;
    priorYearLedgerRevenueMinor: bigint;
    hasPriorYearActivity: boolean;
    currentYearRevenueMinor: bigint;
    taxableProfitMinor: bigint;
    citSmallEnterpriseIneligible?: boolean;
    ineligibilityReason?: string | null;
    priorYearRevenueOverrideMinor?: bigint | null;
    organizationSchedules?: readonly CitRateSchedule[];
    statutorySchedules?: readonly CitRateSchedule[];
    fallbackTaxCodeRateBps?: number | null;
  }>,
): ResolvedCitEstimate {
  const { taxYear } = input;
  const priorYear = taxYear - 1;
  const ineligible = Boolean(input.citSmallEnterpriseIneligible);
  const ineligibilityReason = input.ineligibilityReason?.trim() || null;
  const overrideRevenue = input.priorYearRevenueOverrideMinor ?? null;
  if (overrideRevenue !== null && overrideRevenue < 0n) {
    throw new Error("priorYearRevenueOverrideMinor cannot be negative");
  }

  const schedule = selectCitRateSchedule(
    taxYear,
    input.organizationSchedules ?? [],
    input.statutorySchedules ?? [LAW_67_2025_CIT_SCHEDULE],
  );

  if (!schedule) {
    const fallback = input.fallbackTaxCodeRateBps ?? null;
    const { taxableBaseMinor, estimatedCitMinor } = calculateEstimatedCitMinor(
      input.taxableProfitMinor,
      fallback,
    );
    return Object.freeze({
      formulaVersion: ESTIMATED_CIT_FORMULA_VERSION,
      taxYear,
      priorYear,
      effectiveRateBps: fallback,
      tierCode: null,
      basis: fallback === null ? "unconfigured" : "tax_code_policy",
      assumption:
        fallback === null
          ? `Chưa cấu hình biểu thuế suất TNDN cho kỳ tính thuế năm ${taxYear}`
          : `Áp dụng thuế suất TNDN ${formatRatePercent(fallback)} theo mã thuế đã cấu hình của tổ chức`,
      lawReference: null,
      scheduleSource: null,
      referenceRevenueMinor: null,
      priorYearLedgerRevenueMinor: input.priorYearLedgerRevenueMinor,
      hasPriorYearActivity: input.hasPriorYearActivity,
      currentYearRevenueMinor: input.currentYearRevenueMinor,
      citSmallEnterpriseIneligible: ineligible,
      ineligibilityReason,
      priorYearRevenueOverrideMinor: overrideRevenue,
      taxableProfitMinor: input.taxableProfitMinor,
      taxableBaseMinor,
      estimatedCitMinor,
      tiers: Object.freeze([]),
    });
  }

  const matchTier = (revenueMinor: bigint): CitRateTier => {
    const floored = revenueMinor > 0n ? revenueMinor : 0n;
    for (const tier of schedule.tiers) {
      if (tier.maxRevenueMinor === null || floored <= tier.maxRevenueMinor) {
        return tier;
      }
    }
    return schedule.tiers[schedule.tiers.length - 1]!;
  };

  const standardTier = schedule.tiers[schedule.tiers.length - 1]!;
  let selectedTier: CitRateTier;
  let basis: CitRateBasis;
  let referenceRevenueMinor: bigint | null;
  let assumption: string;

  if (ineligible) {
    selectedTier = standardTier;
    basis = "ineligible_override";
    referenceRevenueMinor =
      overrideRevenue ??
      (input.hasPriorYearActivity || input.priorYearLedgerRevenueMinor > 0n
        ? input.priorYearLedgerRevenueMinor > 0n
          ? input.priorYearLedgerRevenueMinor
          : 0n
        : null);
    const reasonDetail = ineligibilityReason
      ? ` (${ineligibilityReason})`
      : " (công ty con/quan hệ liên kết hoặc khai báo của chủ doanh nghiệp)";
    assumption = `Áp dụng mức phổ thông ${formatRatePercent(selectedTier.rateBps)} theo ${schedule.lawReference} do khai báo không thuộc diện ưu đãi 15%/17%${reasonDetail}`;
  } else if (overrideRevenue !== null) {
    referenceRevenueMinor = overrideRevenue;
    selectedTier = matchTier(referenceRevenueMinor);
    basis = "declared_prior_year_revenue";
    assumption = `Áp dụng bậc ${formatRatePercent(selectedTier.rateBps)} theo ${schedule.lawReference} căn cứ doanh thu năm ${priorYear} khai báo: ${formatMinorNumber(referenceRevenueMinor)}`;
  } else if (input.hasPriorYearActivity || input.priorYearLedgerRevenueMinor > 0n) {
    referenceRevenueMinor =
      input.priorYearLedgerRevenueMinor > 0n ? input.priorYearLedgerRevenueMinor : 0n;
    selectedTier = matchTier(referenceRevenueMinor);
    basis = "prior_year_revenue";
    assumption = `Áp dụng bậc ${formatRatePercent(selectedTier.rateBps)} theo ${schedule.lawReference} căn cứ tổng doanh thu năm ${priorYear} trên sổ cái: ${formatMinorNumber(referenceRevenueMinor)}`;
  } else {
    const provisionalRevenue =
      input.currentYearRevenueMinor > 0n ? input.currentYearRevenueMinor : 0n;
    referenceRevenueMinor = null;
    selectedTier = matchTier(provisionalRevenue);
    basis = "no_prior_year_revenue";
    assumption = `Tạm áp dụng bậc ${formatRatePercent(selectedTier.rateBps)} theo ${schedule.lawReference}: chưa có doanh thu năm ${priorYear} trên sổ cái, tạm căn cứ doanh thu kỳ ${taxYear} (${formatMinorNumber(provisionalRevenue)})`;
  }

  const { taxableBaseMinor, estimatedCitMinor } = calculateEstimatedCitMinor(
    input.taxableProfitMinor,
    selectedTier.rateBps,
  );

  return Object.freeze({
    formulaVersion: ESTIMATED_CIT_FORMULA_VERSION,
    taxYear,
    priorYear,
    effectiveRateBps: selectedTier.rateBps,
    tierCode: selectedTier.tierCode,
    basis,
    assumption,
    lawReference: schedule.lawReference,
    scheduleSource: schedule.source,
    referenceRevenueMinor,
    priorYearLedgerRevenueMinor: input.priorYearLedgerRevenueMinor,
    hasPriorYearActivity: input.hasPriorYearActivity,
    currentYearRevenueMinor: input.currentYearRevenueMinor,
    citSmallEnterpriseIneligible: ineligible,
    ineligibilityReason,
    priorYearRevenueOverrideMinor: overrideRevenue,
    taxableProfitMinor: input.taxableProfitMinor,
    taxableBaseMinor,
    estimatedCitMinor,
    tiers: schedule.tiers,
  });
}
