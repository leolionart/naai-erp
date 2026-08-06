import { describe, expect, it } from "vitest";
import { buildExecutiveMetrics, type ExecutiveMetricsInput } from "./executive-metrics.js";

const base = (overrides: Partial<ExecutiveMetricsInput> = {}): ExecutiveMetricsInput => ({
  organizationId: "org-naai",
  currency: "VND",
  period: { startsOn: "2025-01-01", endsOn: "2025-12-31", asOfDate: "2025-12-31" },
  dimensions: { company: "NAAI Studio" },
  sourceBoundary: { ledgerCutoffFingerprint: "a".repeat(64), sourceIds: ["ledger-2025"] },
  revenueMinor: 1_000n,
  grossProfitMinor: 600n,
  operatingProfitMinor: 300n,
  netProfitMinor: 200n,
  openingEquityMinor: 800n,
  closingEquityMinor: 1_200n,
  contributionsMinor: 200n,
  withdrawalsMinor: 0n,
  reviewedEquityAdjustmentsMinor: 0n,
  openingAssetsMinor: 1_800n,
  closingAssetsMinor: 2_200n,
  retainedEarningsMinor: -600n,
  contributedCapitalMinor: 500n,
  ownerLoansMinor: 900n,
  unrestrictedCashMinor: 360n,
  restrictedCashMinor: 90n,
  reviewedOperatingNetCashFlowMinor: [-100n, -140n, -120n],
  roi: [
    {
      id: "project-a",
      purpose: "project",
      label: "Project A",
      benefitMinor: 300n,
      includedCostMinor: 200n,
      policyVersionId: "project-roi-v1",
      sourceIds: ["project-a"],
    },
    {
      id: "campaign-a",
      purpose: "marketing",
      label: "Campaign A",
      benefitMinor: 150n,
      includedCostMinor: 100n,
      policyVersionId: "marketing-roi-v1",
      sourceIds: ["campaign-a"],
    },
  ],
  ...overrides,
});

describe("ERP-640 executive metrics", () => {
  it("calculates profitability, average-balance returns and purpose-specific ROI", () => {
    const result = buildExecutiveMetrics(base());
    expect(result).toMatchObject({
      grossMargin: { valueBps: 6000 },
      operatingMargin: { valueBps: 3000 },
      netMargin: { valueBps: 2000 },
      ros: { valueBps: 2000 },
      roe: { valueBps: 2000 },
      roa: { valueBps: 1000 },
    });
    expect(
      result.roi.map(({ purpose, returnMinor, ratio }) => ({
        purpose,
        returnMinor,
        valueBps: ratio.valueBps,
      })),
    ).toEqual([
      { purpose: "project", returnMinor: 100n, valueBps: 5000 },
      { purpose: "marketing", returnMinor: 50n, valueBps: 5000 },
    ]);
  });

  it("excludes owner loans from equity consumed and financing from signed operating burn", () => {
    const result = buildExecutiveMetrics(base());
    expect(result).toMatchObject({
      accumulatedLossMinor: 600n,
      contributedCapitalMinor: 500n,
      ownerLoansMinor: 900n,
      equityConsumed: { valueBps: 12000 },
      averageOperatingNetCashFlowMinor: -120n,
      netBurnMinor: 120n,
      unrestrictedCashMinor: 360n,
      restrictedCashMinor: 90n,
      runwayMonthsThousandths: 3_000n,
      runwayStatus: "available",
    });
  });

  it("ties closing equity to contributions withdrawals profit and reviewed adjustments", () => {
    expect(buildExecutiveMetrics(base()).equityRollForward).toMatchObject({
      openingEquityMinor: 800n,
      contributionsMinor: 200n,
      withdrawalsMinor: 0n,
      profitOrLossMinor: 200n,
      reviewedAdjustmentsMinor: 0n,
      expectedClosingEquityMinor: 1_200n,
      actualClosingEquityMinor: 1_200n,
      differenceMinor: 0n,
      status: "tied_out",
    });
    expect(
      buildExecutiveMetrics(base({ closingEquityMinor: 1_190n })).equityRollForward,
    ).toMatchObject({
      expectedClosingEquityMinor: 1_200n,
      actualClosingEquityMinor: 1_190n,
      differenceMinor: -10n,
      status: "difference",
    });
    expect(
      buildExecutiveMetrics(
        base({ reviewedEquityAdjustmentsMinor: -50n, closingEquityMinor: 1_150n }),
      ).equityRollForward,
    ).toMatchObject({
      reviewedAdjustmentsMinor: -50n,
      expectedClosingEquityMinor: 1_150n,
      differenceMinor: 0n,
      status: "tied_out",
    });
  });

  it("keeps custom ROI separate with its object and policy identity", () => {
    const result = buildExecutiveMetrics(
      base({
        roi: [
          ...base().roi,
          {
            id: "training-program",
            purpose: "custom",
            label: "Training program",
            benefitMinor: 90n,
            includedCostMinor: 60n,
            policyVersionId: "custom-training-roi-v1",
            sourceIds: ["training-program"],
          },
        ],
      }),
    );
    expect(result.roi).toHaveLength(3);
    expect(result.roi[2]).toMatchObject({
      id: "training-program",
      purpose: "custom",
      policyVersionId: "custom-training-roi-v1",
      returnMinor: 30n,
      ratio: { valueBps: 5_000 },
    });
  });

  it("uses signed nonzero revenue but positive denominators for returns and equity", () => {
    const negativeRevenue = buildExecutiveMetrics(
      base({ revenueMinor: -1_000n, grossProfitMinor: -600n }),
    );
    expect(negativeRevenue.grossMargin).toMatchObject({ status: "available", valueBps: 6000 });
    const unavailable = buildExecutiveMetrics(
      base({
        revenueMinor: 0n,
        openingEquityMinor: -1n,
        closingEquityMinor: 1n,
        openingAssetsMinor: 0n,
        closingAssetsMinor: 0n,
        contributedCapitalMinor: 0n,
        roi: [{ ...base().roi[0]!, includedCostMinor: 0n }],
      }),
    );
    expect(unavailable.grossMargin.status).toBe("zero_denominator");
    expect(unavailable.roe.status).toBe("non_positive_denominator");
    expect(unavailable.roa.status).toBe("non_positive_denominator");
    expect(unavailable.equityConsumed.status).toBe("non_positive_denominator");
    expect(unavailable.roi[0]?.ratio.status).toBe("non_positive_denominator");
  });

  it("returns cash-generating or missing runway instead of Infinity", () => {
    expect(
      buildExecutiveMetrics(base({ reviewedOperatingNetCashFlowMinor: [100n, -20n] })),
    ).toMatchObject({
      averageOperatingNetCashFlowMinor: 40n,
      netBurnMinor: 0n,
      runwayMonthsThousandths: null,
      runwayStatus: "cash_generating",
    });
    expect(buildExecutiveMetrics(base({ reviewedOperatingNetCashFlowMinor: [] }))).toMatchObject({
      averageOperatingNetCashFlowMinor: null,
      netBurnMinor: null,
      runwayMonthsThousandths: null,
      runwayStatus: "missing_reviewed_burn",
    });
  });

  it("keeps runway deterministic beyond JavaScript safe integer precision", () => {
    const result = buildExecutiveMetrics(
      base({
        unrestrictedCashMinor: 9_007_199_254_740_993n,
        reviewedOperatingNetCashFlowMinor: [-2n],
      }),
    );
    expect(result.runwayMonthsThousandths).toBe(4_503_599_627_370_496_500n);
  });
});
