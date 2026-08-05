import { describe, expect, it } from "vitest";

import { buildProjectProfitability, profitabilityRatioBps } from "./project-profitability.js";

const drilldown = {
  recognitionEventIds: ["recognition-2", "recognition-1"],
  invoiceIds: ["invoice-1"],
  reconciliationIds: ["reconciliation-1"],
  directCostItemIds: ["cost-1"],
  overheadAllocationRunIds: ["run-1"],
  overheadAllocationSplitIds: ["split-variable", "split-fixed"],
  timesheetIds: ["timesheet-1"],
  budgetVersionIds: ["budget-1"],
  journalIds: ["journal-1"],
} as const;

describe("project profitability", () => {
  it("calculates gross, contribution and fully loaded profit from recognized revenue", () => {
    const report = buildProjectProfitability({
      organizationId: "org-naai",
      projectId: "project-1",
      clientId: "client-1",
      serviceLineCode: "web-app",
      accountOwnerId: "owner-1",
      startsOn: "2026-08-01",
      endsOn: "2026-08-31",
      currency: "vnd",
      recognizedRevenueMinor: 100_000_000n,
      invoicedRevenueMinor: 120_000_000n,
      collectedRevenueMinor: 80_000_000n,
      directProjectCostMinor: 40_000_000n,
      variableOverheadMinor: 10_000_000n,
      fixedOverheadMinor: 15_000_000n,
      budgetCostMinor: 60_000_000n,
      unbilledWorkMinor: 5_000_000n,
      overdueArMinor: 12_000_000n,
      billableMinutes: 6_000,
      projectMinutes: 7_200,
      availableMinutes: 9_600,
      missingDimensionSourceIds: ["journal-line-9"],
      drilldown,
    });

    expect(report).toMatchObject({
      currency: "VND",
      fullyLoadedCostMinor: 65_000_000n,
      grossMarginMinor: 60_000_000n,
      grossMarginBps: 6_000,
      contributionMarginMinor: 50_000_000n,
      contributionMarginBps: 5_000,
      fullyLoadedProfitMinor: 35_000_000n,
      fullyLoadedMarginBps: 3_500,
      realizedHourlyRateMinor: 1_000_000n,
      utilizationBps: 6_250,
      overrunMinor: 5_000_000n,
      overrunBps: 833,
    });
    expect(report.confidenceFlags.map((flag) => flag.code)).toEqual([
      "unbilled_work",
      "overdue_ar",
      "budget_overrun",
      "missing_dimensions",
    ]);
    expect(report.drilldown.recognitionEventIds).toEqual(["recognition-1", "recognition-2"]);
  });

  it("keeps cash collected separate from profit and returns null for zero denominators", () => {
    const report = buildProjectProfitability({
      organizationId: "org-naai",
      projectId: "project-prebill",
      startsOn: "2026-08-01",
      endsOn: "2026-08-31",
      currency: "VND",
      recognizedRevenueMinor: 0n,
      invoicedRevenueMinor: 20_000n,
      collectedRevenueMinor: 20_000n,
      directProjectCostMinor: 5_000n,
      variableOverheadMinor: 0n,
      fixedOverheadMinor: 0n,
      budgetCostMinor: 0n,
      unbilledWorkMinor: 0n,
      overdueArMinor: 0n,
      billableMinutes: 0,
      projectMinutes: 0,
      availableMinutes: 0,
      missingDimensionSourceIds: [],
      drilldown,
    });

    expect(report.fullyLoadedProfitMinor).toBe(-5_000n);
    expect(report.fullyLoadedMarginBps).toBeNull();
    expect(report.realizedHourlyRateMinor).toBeNull();
    expect(report.utilizationBps).toBeNull();
    expect(report.overrunBps).toBeNull();
    expect(report.confidenceFlags.map((flag) => flag.code)).toEqual(["budget_overrun"]);
  });

  it("rounds exact ratios to the nearest integer basis point", () => {
    expect(profitabilityRatioBps(1n, 3n)).toBe(3_333);
    expect(profitabilityRatioBps(-1n, 3n)).toBe(-3_333);
    expect(profitabilityRatioBps(1n, -4n)).toBe(-2_500);
    expect(profitabilityRatioBps(1n, 0n)).toBeNull();
  });

  it("rejects invalid periods, minutes and negative confidence amounts", () => {
    const base = {
      organizationId: "org-naai",
      projectId: "project-1",
      startsOn: "2026-08-01",
      endsOn: "2026-08-31",
      currency: "VND",
      recognizedRevenueMinor: 1n,
      invoicedRevenueMinor: 1n,
      collectedRevenueMinor: 1n,
      directProjectCostMinor: 0n,
      variableOverheadMinor: 0n,
      fixedOverheadMinor: 0n,
      budgetCostMinor: 0n,
      unbilledWorkMinor: 0n,
      overdueArMinor: 0n,
      billableMinutes: 0,
      projectMinutes: 0,
      availableMinutes: 0,
      missingDimensionSourceIds: [],
      drilldown,
    } as const;
    expect(() => buildProjectProfitability({ ...base, endsOn: "2026-07-31" })).toThrow(
      "cannot precede",
    );
    expect(() => buildProjectProfitability({ ...base, projectMinutes: -1 })).toThrow(
      "non-negative safe integer",
    );
    expect(() => buildProjectProfitability({ ...base, overdueArMinor: -1n })).toThrow(
      "cannot be negative",
    );
  });
});
