import { describe, expect, it } from "vitest";
import { buildProjectProfitability, profitabilityRatioBps } from "./project-profitability.js";

const drilldown = {
  recognitionEventIds: ["recognition-2", "recognition-1"],
  invoiceIds: ["invoice-1"],
  reconciliationIds: ["reconciliation-1"],
  expenseIds: ["expense-1"],
  purchaseDocumentIds: ["purchase-1"],
  budgetVersionIds: ["budget-1"],
  journalIds: ["journal-1"],
} as const;
const base = {
  organizationId: "org-naai",
  projectId: "project-1",
  startsOn: "2026-08-01",
  endsOn: "2026-08-31",
  currency: "vnd",
  recognizedRevenueMinor: 100_000_000n,
  invoicedRevenueMinor: 120_000_000n,
  collectedRevenueMinor: 80_000_000n,
  directProjectCostMinor: 40_000_000n,
  budgetCostMinor: 35_000_000n,
  unbilledWorkMinor: 5_000_000n,
  overdueArMinor: 12_000_000n,
  missingDimensionSourceIds: ["journal-line-9"],
  drilldown,
} as const;

describe("project profitability", () => {
  it("calculates project margin from recognized revenue and canonical direct costs", () => {
    const report = buildProjectProfitability(base);
    expect(report).toMatchObject({
      currency: "VND",
      grossMarginMinor: 60_000_000n,
      grossMarginBps: 6_000,
      overrunMinor: 5_000_000n,
      overrunBps: 1_429,
    });
    expect(report.confidenceFlags.map((flag) => flag.code)).toEqual([
      "unbilled_work",
      "overdue_ar",
      "budget_overrun",
      "missing_dimensions",
    ]);
    expect(report.drilldown.recognitionEventIds).toEqual(["recognition-1", "recognition-2"]);
  });

  it("keeps cash collected separate from profit and handles zero denominators", () => {
    const report = buildProjectProfitability({
      ...base,
      recognizedRevenueMinor: 0n,
      directProjectCostMinor: 5_000n,
      budgetCostMinor: 0n,
      unbilledWorkMinor: 0n,
      overdueArMinor: 0n,
      missingDimensionSourceIds: [],
    });
    expect(report.grossMarginMinor).toBe(-5_000n);
    expect(report.grossMarginBps).toBeNull();
    expect(report.overrunBps).toBeNull();
  });

  it("rounds exact ratios and rejects invalid inputs", () => {
    expect(profitabilityRatioBps(1n, 3n)).toBe(3_333);
    expect(profitabilityRatioBps(-1n, 3n)).toBe(-3_333);
    expect(() => buildProjectProfitability({ ...base, endsOn: "2026-07-31" })).toThrow(
      "cannot precede",
    );
    expect(() => buildProjectProfitability({ ...base, directProjectCostMinor: -1n })).toThrow(
      "cannot be negative",
    );
  });
});
