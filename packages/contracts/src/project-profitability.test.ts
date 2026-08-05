import { describe, expect, it } from "vitest";

import {
  PROJECT_PROFITABILITY_CONTRACT_VERSION,
  type ProjectProfitabilityContract,
  type ProjectProfitabilityQueryContract,
} from "./project-profitability.js";

describe("project profitability contract", () => {
  it("keeps exact money, nullable denominator ratios, confidence and drill-down machine-readable", () => {
    const query: ProjectProfitabilityQueryContract = {
      startsOn: "2026-08-01",
      endsOn: "2026-08-31",
      groupBy: "service_line",
      confidenceCode: "budget_overrun",
      limit: 50,
    };
    const report: ProjectProfitabilityContract = {
      schemaVersion: PROJECT_PROFITABILITY_CONTRACT_VERSION,
      organizationId: "org-naai",
      projectId: "project-1",
      clientId: "client-1",
      serviceLineCode: "web-app",
      accountOwnerId: "owner-1",
      startsOn: query.startsOn,
      endsOn: query.endsOn,
      currency: "VND",
      recognizedRevenueMinor: "100000000",
      invoicedRevenueMinor: "120000000",
      collectedRevenueMinor: "80000000",
      directProjectCostMinor: "40000000",
      variableOverheadMinor: "10000000",
      fixedOverheadMinor: "15000000",
      fullyLoadedCostMinor: "65000000",
      grossMarginMinor: "60000000",
      grossMarginBps: 6000,
      contributionMarginMinor: "50000000",
      contributionMarginBps: 5000,
      fullyLoadedProfitMinor: "35000000",
      fullyLoadedMarginBps: 3500,
      realizedHourlyRateMinor: "1000000",
      utilizationBps: 7500,
      budgetCostMinor: "60000000",
      overrunMinor: "5000000",
      overrunBps: 833,
      unbilledWorkMinor: "5000000",
      overdueArMinor: "12000000",
      billableMinutes: 6000,
      projectMinutes: 7200,
      availableMinutes: 9600,
      confidenceFlags: [
        {
          code: "budget_overrun",
          severity: "critical",
          amountMinor: "5000000",
          sourceIds: ["budget-1"],
        },
      ],
      drilldown: {
        recognitionEventIds: ["recognition-1"],
        invoiceIds: ["invoice-1"],
        reconciliationIds: ["reconciliation-1"],
        directCostItemIds: ["cost-1"],
        overheadAllocationRunIds: ["run-1"],
        overheadAllocationSplitIds: ["split-1"],
        timesheetIds: ["timesheet-1"],
        budgetVersionIds: ["budget-1"],
        journalIds: ["journal-1"],
      },
    };

    expect(report.schemaVersion).toBe(1);
    expect(report.fullyLoadedProfitMinor).toBe("35000000");
    expect(report.confidenceFlags[0]?.sourceIds).toEqual(["budget-1"]);
  });

  it("represents undefined ratios as null instead of synthetic zero", () => {
    const nullableRatios: Pick<
      ProjectProfitabilityContract,
      "grossMarginBps" | "realizedHourlyRateMinor" | "utilizationBps" | "overrunBps"
    > = {
      grossMarginBps: null,
      realizedHourlyRateMinor: null,
      utilizationBps: null,
      overrunBps: null,
    };
    expect(Object.values(nullableRatios)).toEqual([null, null, null, null]);
  });
});
