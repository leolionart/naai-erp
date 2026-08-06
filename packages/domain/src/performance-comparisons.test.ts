import { describe, expect, it } from "vitest";
import {
  buildPerformanceComparison,
  prorateTargetInclusive,
  type PerformanceAmount,
  type PerformanceComparisonInput,
} from "./performance-comparisons.js";

const available = (
  amountMinor: bigint,
  sourceId: string,
  window?: { startsOn: string; endsOn: string },
): PerformanceAmount => ({
  status: "available",
  amountMinor,
  sourceIds: [sourceId],
  ...(window ? { window } : {}),
});

const missing = (reason: string): PerformanceAmount => ({
  status: "missing",
  reason,
  sourceIds: [],
});

const base = (overrides: Partial<PerformanceComparisonInput> = {}): PerformanceComparisonInput => ({
  organizationId: "org-naai",
  metricKey: "revenue",
  actualBasis: "recognized",
  currency: "VND",
  timezone: "Asia/Ho_Chi_Minh",
  asOfInstant: "2026-08-14T17:30:00.000Z",
  period: {
    basis: "calendar",
    kind: "month",
    id: "2026-08",
    label: "August 2026",
    startsOn: "2026-08-01",
    endsOn: "2026-08-31",
  },
  dimensions: { serviceLineCode: "web-app" },
  actualToDate: available(1_200n, "actual-aug", {
    startsOn: "2026-08-01",
    endsOn: "2026-08-15",
  }),
  fullTarget: available(3_100n, "target-aug"),
  fullPeriodForecast: available(3_300n, "forecast-aug"),
  previousPeriodComparable: available(1_000n, "actual-jul", {
    startsOn: "2026-07-01",
    endsOn: "2026-07-15",
  }),
  priorYearComparable: available(800n, "actual-2025", {
    startsOn: "2025-08-01",
    endsOn: "2025-08-15",
  }),
  ...overrides,
});

describe("ERP-620 performance comparisons", () => {
  it("uses Asia/Ho_Chi_Minh local date and inclusive MTD target proration", () => {
    const result = buildPerformanceComparison(base());
    expect(result).toMatchObject({
      asOfLocalDate: "2026-08-15",
      elapsedDays: 15,
      periodDays: 31,
      proratedTargetMinor: 1_500n,
      currentWindow: {
        startsOn: "2026-08-01",
        endsOn: "2026-08-15",
        dayCount: 15,
      },
      momWindow: { startsOn: "2026-07-01", endsOn: "2026-07-15" },
      yoyWindow: { startsOn: "2025-08-01", endsOn: "2025-08-15" },
      actualVsProratedTarget: {
        status: "available",
        denominatorMinor: 1_500n,
        varianceMinor: -300n,
        ratioBps: 8_000,
        varianceBps: -2_000,
      },
      actualVsRetainedForecast: {
        numeratorMinor: 1_200n,
        denominatorMinor: 3_300n,
        varianceMinor: -2_100n,
        ratioBps: 3_636,
        varianceBps: -6_364,
      },
      monthOverMonth: { ratioBps: 12_000, varianceBps: 2_000 },
      yearOverYear: { ratioBps: 15_000, varianceBps: 5_000 },
    });
    expect(result.sourceIds).toEqual([
      "actual-2025",
      "actual-aug",
      "actual-jul",
      "forecast-aug",
      "target-aug",
    ]);
  });

  it("compares full-period forecast against full target, never prorated target", () => {
    const result = buildPerformanceComparison(base());
    expect(result.forecastVsFullTarget).toMatchObject({
      numeratorMinor: 3_300n,
      denominatorMinor: 3_100n,
      varianceMinor: 200n,
      ratioBps: 10_645,
      varianceBps: 645,
    });
    expect(result.actualVsFullTarget).toMatchObject({
      denominatorMinor: 3_100n,
      ratioBps: 3_871,
      varianceBps: -6_129,
    });
    expect(result.actualVsRetainedForecast).toMatchObject({
      basis: "actual_vs_retained_forecast",
      numeratorMinor: 1_200n,
      denominatorMinor: 3_300n,
    });
  });

  it("clamps shorter prior months and leap-year YoY dates", () => {
    const march = buildPerformanceComparison(
      base({
        asOfInstant: "2026-03-31T10:00:00.000Z",
        period: {
          basis: "calendar",
          kind: "month",
          id: "2026-03",
          label: "March 2026",
          startsOn: "2026-03-01",
          endsOn: "2026-03-31",
        },
        actualToDate: available(1n, "march", { startsOn: "2026-03-01", endsOn: "2026-03-31" }),
        previousPeriodComparable: available(1n, "feb", {
          startsOn: "2026-02-01",
          endsOn: "2026-02-28",
        }),
        priorYearComparable: available(1n, "march-2025", {
          startsOn: "2025-03-01",
          endsOn: "2025-03-31",
        }),
      }),
    );
    expect(march.momWindow).toMatchObject({ endsOn: "2026-02-28", clamped: true });
    expect(march.confidenceFlags.map((flag) => flag.code)).toContain("comparison_window_clamped");

    const leap = buildPerformanceComparison(
      base({
        asOfInstant: "2028-02-29T10:00:00.000Z",
        period: {
          basis: "calendar",
          kind: "month",
          id: "2028-02",
          label: "February 2028",
          startsOn: "2028-02-01",
          endsOn: "2028-02-29",
        },
        actualToDate: available(1n, "leap", { startsOn: "2028-02-01", endsOn: "2028-02-29" }),
        previousPeriodComparable: available(1n, "jan", {
          startsOn: "2028-01-01",
          endsOn: "2028-01-29",
        }),
        priorYearComparable: available(1n, "feb-2027", {
          startsOn: "2027-02-01",
          endsOn: "2027-02-28",
        }),
      }),
    );
    expect(leap.yoyWindow).toMatchObject({ endsOn: "2027-02-28", clamped: true });
  });

  it("distinguishes missing comparison data from a real zero denominator", () => {
    const result = buildPerformanceComparison(
      base({
        fullTarget: missing("target_not_published"),
        fullPeriodForecast: missing("forecast_not_published"),
        previousPeriodComparable: available(0n, "zero-jul", {
          startsOn: "2026-07-01",
          endsOn: "2026-07-15",
        }),
        priorYearComparable: missing("prior_year_not_loaded"),
      }),
    );
    expect(result.proratedTargetMinor).toBeNull();
    expect(result.actualVsProratedTarget).toMatchObject({
      status: "missing",
      ratioBps: null,
      varianceBps: null,
    });
    expect(result.actualVsRetainedForecast).toMatchObject({
      status: "missing",
      reason: "denominator_missing:forecast_not_published",
      ratioBps: null,
    });
    expect(result.monthOverMonth).toMatchObject({
      status: "zero_denominator",
      denominatorMinor: 0n,
      varianceMinor: 1_200n,
      ratioBps: null,
    });
    expect(result.yearOverYear.status).toBe("missing");
    expect(result.confidenceFlags.map((flag) => flag.code)).toEqual(
      expect.arrayContaining([
        "missing_target",
        "missing_forecast",
        "missing_yoy_comparison",
        "zero_mom_denominator",
      ]),
    );
  });

  it("keeps negative non-zero comparison denominators distinct from zero", () => {
    const result = buildPerformanceComparison(
      base({
        actualToDate: available(-50n, "current-loss", {
          startsOn: "2026-08-01",
          endsOn: "2026-08-15",
        }),
        previousPeriodComparable: available(-100n, "prior-loss", {
          startsOn: "2026-07-01",
          endsOn: "2026-07-15",
        }),
      }),
    );
    expect(result.monthOverMonth).toMatchObject({
      status: "available",
      ratioBps: 5_000,
      varianceBps: -5_000,
      varianceMinor: 50n,
    });
  });

  it("applies the normal zero-denominator policy to retained forecast comparison", () => {
    const result = buildPerformanceComparison(
      base({ fullPeriodForecast: available(0n, "zero-retained-forecast") }),
    );
    expect(result.actualVsRetainedForecast).toMatchObject({
      basis: "actual_vs_retained_forecast",
      status: "zero_denominator",
      numeratorMinor: 1_200n,
      denominatorMinor: 0n,
      varianceMinor: 1_200n,
      ratioBps: null,
      varianceBps: null,
      reason: "comparison_denominator_zero",
    });
  });

  it("uses explicit fiscal comparable mappings instead of calendar assumptions", () => {
    const result = buildPerformanceComparison(
      base({
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
        actualToDate: available(1_200n, "fiscal-current", {
          startsOn: "2026-08-04",
          endsOn: "2026-08-15",
        }),
        previousPeriodComparable: available(1_000n, "fiscal-prior", {
          startsOn: "2026-07-07",
          endsOn: "2026-07-18",
        }),
        priorYearComparable: available(900n, "fiscal-yoy", {
          startsOn: "2025-08-05",
          endsOn: "2025-08-16",
        }),
        fiscalMomWindow: { startsOn: "2026-07-07", endsOn: "2026-07-18" },
        fiscalYoyWindow: { startsOn: "2025-08-05", endsOn: "2025-08-16" },
      }),
    );
    expect(result.momWindow).toMatchObject({ derivation: "fiscal_mapping", dayCount: 12 });
    expect(result.yoyWindow).toMatchObject({ derivation: "fiscal_mapping", dayCount: 12 });
    expect(result.period).toMatchObject({ fiscalYear: 2026, fiscalPeriodNumber: 8 });
  });

  it("rounds proration half away from zero and validates source/window states", () => {
    expect(prorateTargetInclusive(1n, 1, 2)).toBe(1n);
    expect(prorateTargetInclusive(-1n, 1, 2)).toBe(-1n);
    expect(() =>
      buildPerformanceComparison(
        base({
          actualToDate: available(1n, "wrong-window", {
            startsOn: "2026-08-01",
            endsOn: "2026-08-14",
          }),
        }),
      ),
    ).toThrow("does not match");
    expect(() =>
      buildPerformanceComparison(
        base({
          fullTarget: { status: "missing", amountMinor: 0n, reason: "bad", sourceIds: [] },
        }),
      ),
    ).toThrow("missing amount must be absent");
  });
});
