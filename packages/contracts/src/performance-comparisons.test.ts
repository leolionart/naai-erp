import { describe, expect, it } from "vitest";
import {
  PERFORMANCE_COMPARISON_CONTRACT_VERSION,
  PERFORMANCE_COMPARISON_FORMULA_VERSION,
  type BuildPerformanceComparisonRequest,
  type PerformanceComparisonContract,
} from "./performance-comparisons.js";

describe("ERP-620 performance comparison public contracts", () => {
  it("keeps request basis, period metadata, source status and exact string money explicit", () => {
    const amount = (amountMinor: string, sourceId: string) => ({
      status: "available" as const,
      amountMinor,
      sourceIds: [sourceId],
    });
    const request: BuildPerformanceComparisonRequest = {
      schemaVersion: PERFORMANCE_COMPARISON_CONTRACT_VERSION,
      organizationId: "org-naai",
      metricKey: "revenue",
      actualBasis: "recognized",
      currency: "VND",
      timezone: "Asia/Ho_Chi_Minh",
      asOfInstant: "2026-08-15T00:00:00.000+07:00",
      period: {
        basis: "fiscal",
        kind: "fiscal_period",
        id: "FY2026-P08",
        label: "FY2026 period 8",
        startsOn: "2026-08-04",
        endsOn: "2026-08-31",
        fiscalYear: 2026,
        fiscalPeriodNumber: 8,
      },
      actualToDate: amount("120000000", "actual-1"),
      fullTarget: amount("200000000", "target-1"),
      fullPeriodForecast: amount("210000000", "forecast-1"),
      previousPeriodComparable: amount("100000000", "mom-1"),
      priorYearComparable: amount("90000000", "yoy-1"),
      fiscalMomWindow: { startsOn: "2026-07-07", endsOn: "2026-07-18" },
      fiscalYoyWindow: { startsOn: "2025-08-05", endsOn: "2025-08-16" },
    };
    expect(request.fullTarget.amountMinor).toBe("200000000");
    expect(request.period.fiscalPeriodNumber).toBe(8);
  });

  it("keeps null denominator policy and every output amount JSON safe", () => {
    const line = {
      basis: "month_over_month" as const,
      formulaVersion: PERFORMANCE_COMPARISON_FORMULA_VERSION,
      nullPolicyVersion: "ratio-null-policy-v1" as const,
      status: "zero_denominator" as const,
      reason: "comparison_denominator_zero",
      numeratorMinor: "120000000",
      denominatorMinor: "0",
      varianceMinor: "120000000",
      ratioBps: null,
      varianceBps: null,
      numeratorSourceIds: ["actual"],
      denominatorSourceIds: ["previous"],
    };
    const contract = {
      schemaVersion: PERFORMANCE_COMPARISON_CONTRACT_VERSION,
      organizationId: "org-naai",
      metricKey: "revenue",
      actualBasis: "recognized",
      currency: "VND",
      timezone: "Asia/Ho_Chi_Minh",
      asOfInstant: "2026-08-15T00:00:00.000+07:00",
      asOfLocalDate: "2026-08-15",
      period: {
        basis: "calendar",
        kind: "month",
        id: "2026-08",
        label: "August 2026",
        startsOn: "2026-08-01",
        endsOn: "2026-08-31",
      },
      dimensions: {},
      formulaVersion: PERFORMANCE_COMPARISON_FORMULA_VERSION,
      prorationFormulaVersion: "inclusive-calendar-day-proration-v1",
      windowFormulaVersion: "comparable-window-v1",
      nullPolicyVersion: "ratio-null-policy-v1",
      currentWindow: {
        startsOn: "2026-08-01",
        endsOn: "2026-08-15",
        dayCount: 15,
        comparisonType: "current",
        derivation: "as_of",
        clamped: false,
      },
      momWindow: {
        startsOn: "2026-07-01",
        endsOn: "2026-07-15",
        dayCount: 15,
        comparisonType: "mom",
        derivation: "calendar_shift",
        clamped: false,
      },
      yoyWindow: {
        startsOn: "2025-08-01",
        endsOn: "2025-08-15",
        dayCount: 15,
        comparisonType: "yoy",
        derivation: "calendar_shift",
        clamped: false,
      },
      elapsedDays: 15,
      periodDays: 31,
      proratedTargetMinor: "96774194",
      actualVsProratedTarget: { ...line, basis: "actual_vs_prorated_target" },
      actualVsFullTarget: { ...line, basis: "actual_vs_full_target" },
      actualVsRetainedForecast: { ...line, basis: "actual_vs_retained_forecast" },
      forecastVsFullTarget: { ...line, basis: "forecast_vs_full_target" },
      monthOverMonth: line,
      yearOverYear: { ...line, basis: "year_over_year" },
      sourceIds: ["actual", "previous"],
      confidenceFlags: [
        {
          code: "zero_mom_denominator",
          severity: "warning",
          reason: "Previous comparable amount is zero",
          sourceIds: ["previous"],
        },
      ],
    } satisfies PerformanceComparisonContract;
    expect(contract.monthOverMonth.ratioBps).toBeNull();
    expect(contract.proratedTargetMinor).toMatch(/^\d+$/);
  });
});
