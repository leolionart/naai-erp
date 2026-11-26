import { describe, expect, it } from "vitest";
import {
  LAW_67_2025_CIT_SCHEDULE,
  resolveEstimatedCit,
  selectCitRateSchedule,
  validateCitRateSchedule,
  type CitRateSchedule,
} from "./cit-rate.js";

describe("T-UNIT-TAX-102 — estimated CIT rate by prior-year revenue tier (BR-TAX-102)", () => {
  it("selects 15% up to 3,000,000,000, 17% up to 50,000,000,000, and 20% above 50,000,000,000", () => {
    const cases: Array<{
      priorRevenue: bigint;
      expectedRateBps: number;
      expectedTier: string;
      expectedCit: bigint;
    }> = [
      {
        priorRevenue: 0n,
        expectedRateBps: 1500,
        expectedTier: "small_15",
        expectedCit: 15_000_000n,
      },
      {
        priorRevenue: 2_999_999_999n,
        expectedRateBps: 1500,
        expectedTier: "small_15",
        expectedCit: 15_000_000n,
      },
      {
        priorRevenue: 3_000_000_000n,
        expectedRateBps: 1500,
        expectedTier: "small_15",
        expectedCit: 15_000_000n,
      },
      {
        priorRevenue: 3_000_000_001n,
        expectedRateBps: 1700,
        expectedTier: "medium_17",
        expectedCit: 17_000_000n,
      },
      {
        priorRevenue: 50_000_000_000n,
        expectedRateBps: 1700,
        expectedTier: "medium_17",
        expectedCit: 17_000_000n,
      },
      {
        priorRevenue: 50_000_000_001n,
        expectedRateBps: 2000,
        expectedTier: "standard_20",
        expectedCit: 20_000_000n,
      },
    ];

    for (const item of cases) {
      const result = resolveEstimatedCit({
        taxYear: 2026,
        priorYearLedgerRevenueMinor: item.priorRevenue,
        hasPriorYearActivity: true,
        currentYearRevenueMinor: 100_000_000n,
        taxableProfitMinor: 100_000_000n,
      });
      expect(result.effectiveRateBps).toBe(item.expectedRateBps);
      expect(result.tierCode).toBe(item.expectedTier);
      expect(result.basis).toBe("prior_year_revenue");
      expect(result.referenceRevenueMinor).toBe(item.priorRevenue);
      expect(result.estimatedCitMinor).toBe(item.expectedCit);
      expect(result.assumption).toContain("Law 67/2025/QH15");
      expect(result.assumption).toContain("2025");
    }
  });

  it("handles year with no prior-year revenue by provisionally estimating from current-year revenue or declared prior-year revenue", () => {
    const noPriorSmall = resolveEstimatedCit({
      taxYear: 2026,
      priorYearLedgerRevenueMinor: 0n,
      hasPriorYearActivity: false,
      currentYearRevenueMinor: 1_200_000_000n,
      taxableProfitMinor: 200_000_000n,
    });
    expect(noPriorSmall.effectiveRateBps).toBe(1500);
    expect(noPriorSmall.tierCode).toBe("small_15");
    expect(noPriorSmall.basis).toBe("no_prior_year_revenue");
    expect(noPriorSmall.referenceRevenueMinor).toBeNull();
    expect(noPriorSmall.estimatedCitMinor).toBe(30_000_000n);
    expect(noPriorSmall.assumption).toContain("chưa có doanh thu năm 2025 trên sổ cái");

    const noPriorMedium = resolveEstimatedCit({
      taxYear: 2026,
      priorYearLedgerRevenueMinor: 0n,
      hasPriorYearActivity: false,
      currentYearRevenueMinor: 8_000_000_000n,
      taxableProfitMinor: 200_000_000n,
    });
    expect(noPriorMedium.effectiveRateBps).toBe(1700);
    expect(noPriorMedium.tierCode).toBe("medium_17");
    expect(noPriorMedium.basis).toBe("no_prior_year_revenue");
    expect(noPriorMedium.estimatedCitMinor).toBe(34_000_000n);

    const declaredPrior = resolveEstimatedCit({
      taxYear: 2026,
      priorYearLedgerRevenueMinor: 0n,
      hasPriorYearActivity: false,
      currentYearRevenueMinor: 500_000_000n,
      priorYearRevenueOverrideMinor: 12_000_000_000n,
      taxableProfitMinor: 100_000_000n,
    });
    expect(declaredPrior.effectiveRateBps).toBe(1700);
    expect(declaredPrior.basis).toBe("declared_prior_year_revenue");
    expect(declaredPrior.referenceRevenueMinor).toBe(12_000_000_000n);
    expect(declaredPrior.estimatedCitMinor).toBe(17_000_000n);
  });

  it("forces standard 20% rate when citSmallEnterpriseIneligible override is declared", () => {
    const overridden = resolveEstimatedCit({
      taxYear: 2026,
      priorYearLedgerRevenueMinor: 800_000_000n,
      hasPriorYearActivity: true,
      currentYearRevenueMinor: 900_000_000n,
      taxableProfitMinor: 100_000_000n,
      citSmallEnterpriseIneligible: true,
      ineligibilityReason: "Công ty con của tập đoàn doanh thu > 50 tỷ",
    });
    expect(overridden.effectiveRateBps).toBe(2000);
    expect(overridden.tierCode).toBe("standard_20");
    expect(overridden.basis).toBe("ineligible_override");
    expect(overridden.citSmallEnterpriseIneligible).toBe(true);
    expect(overridden.estimatedCitMinor).toBe(20_000_000n);
    expect(overridden.assumption).toContain("20%");
    expect(overridden.assumption).toContain("Công ty con của tập đoàn doanh thu > 50 tỷ");
  });

  it("supports configurable year-specific schedules and pre-2025 fallback", () => {
    const custom2027: CitRateSchedule = {
      effectiveFromYear: 2027,
      effectiveToYear: null,
      lawReference: "Amended CIT Policy 2027",
      standardRateBps: 2000,
      source: "organization",
      tiers: [
        {
          tierOrder: 1,
          tierCode: "micro_12",
          label: "<= 5B (12%)",
          maxRevenueMinor: 5_000_000_000n,
          rateBps: 1200,
        },
        {
          tierOrder: 2,
          tierCode: "standard_20",
          label: "> 5B (20%)",
          maxRevenueMinor: null,
          rateBps: 2000,
        },
      ],
    };

    expect(
      selectCitRateSchedule(2027, [custom2027], [LAW_67_2025_CIT_SCHEDULE])?.lawReference,
    ).toBe("Amended CIT Policy 2027");

    const in2027 = resolveEstimatedCit({
      taxYear: 2027,
      priorYearLedgerRevenueMinor: 4_000_000_000n,
      hasPriorYearActivity: true,
      currentYearRevenueMinor: 1_000_000_000n,
      taxableProfitMinor: 100_000_000n,
      organizationSchedules: [custom2027],
    });
    expect(in2027.effectiveRateBps).toBe(1200);
    expect(in2027.estimatedCitMinor).toBe(12_000_000n);

    const pre2025 = resolveEstimatedCit({
      taxYear: 2024,
      priorYearLedgerRevenueMinor: 1_000_000_000n,
      hasPriorYearActivity: true,
      currentYearRevenueMinor: 1_000_000_000n,
      taxableProfitMinor: 100_000_000n,
      fallbackTaxCodeRateBps: 2000,
    });
    expect(pre2025.effectiveRateBps).toBe(2000);
    expect(pre2025.basis).toBe("tax_code_policy");

    const pre2025Missing = resolveEstimatedCit({
      taxYear: 2024,
      priorYearLedgerRevenueMinor: 1_000_000_000n,
      hasPriorYearActivity: true,
      currentYearRevenueMinor: 1_000_000_000n,
      taxableProfitMinor: 100_000_000n,
    });
    expect(pre2025Missing.effectiveRateBps).toBeNull();
    expect(pre2025Missing.basis).toBe("unconfigured");
    expect(pre2025Missing.estimatedCitMinor).toBeNull();
  });

  it("floors negative taxable profit at zero for CIT while preserving signed taxableProfitMinor", () => {
    const loss = resolveEstimatedCit({
      taxYear: 2026,
      priorYearLedgerRevenueMinor: 2_000_000_000n,
      hasPriorYearActivity: true,
      currentYearRevenueMinor: 500_000_000n,
      taxableProfitMinor: -45_000_000n,
    });
    expect(loss.taxableProfitMinor).toBe(-45_000_000n);
    expect(loss.taxableBaseMinor).toBe(0n);
    expect(loss.effectiveRateBps).toBe(1500);
    expect(loss.estimatedCitMinor).toBe(0n);
  });

  it("rejects malformed tier schedules", () => {
    expect(() =>
      validateCitRateSchedule({
        effectiveFromYear: 2025,
        effectiveToYear: null,
        lawReference: "Bad schedule",
        standardRateBps: 2000,
        source: "organization",
        tiers: [
          {
            tierOrder: 1,
            tierCode: "bounded_only",
            label: "Missing unbounded final tier",
            maxRevenueMinor: 3_000_000_000n,
            rateBps: 1500,
          },
        ],
      }),
    ).toThrow("Final CIT tier must be unbounded");
  });
});
