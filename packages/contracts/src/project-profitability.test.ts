import { describe, expect, it } from "vitest";

import {
  PROJECT_PROFITABILITY_CONTRACT_VERSION,
  type ProjectProfitabilityContract,
  type ProjectProfitabilityQueryContract,
} from "./project-profitability.js";

describe("project profitability contract", () => {
  it("keeps exact money, nullable denominator ratios, confidence and drill-down machine-readable", () => {
    const query: ProjectProfitabilityQueryContract = {
      asOf: "2026-08-31",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      groupBy: "service_line",
      confidenceFlag: "budget_overrun",
      limit: 50,
    };
    const report: ProjectProfitabilityContract = {
      schemaVersion: PROJECT_PROFITABILITY_CONTRACT_VERSION,
      organizationId: "org-naai",
      projectId: "project-1",
      clientId: "client-1",
      serviceLineCode: "web-app",
      accountOwnerId: "owner-1",
      startsOn: query.periodStart,
      endsOn: query.periodEnd,
      currency: "VND",
      recognizedRevenueMinor: "100000000",
      invoicedRevenueMinor: "120000000",
      collectedRevenueMinor: "80000000",
      directProjectCostMinor: "40000000",
      grossMarginMinor: "60000000",
      grossMarginBps: 6000,
      budgetCostMinor: "60000000",
      overrunMinor: "5000000",
      overrunBps: 833,
      unbilledWorkMinor: "5000000",
      overdueArMinor: "12000000",
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
        expenseIds: ["expense-1"],
        purchaseDocumentIds: ["purchase-1"],
        budgetVersionIds: ["budget-1"],
        journalIds: ["journal-1"],
      },
    };

    expect(report.schemaVersion).toBe(1);
    expect(report.grossMarginMinor).toBe("60000000");
    expect(report.confidenceFlags[0]?.sourceIds).toEqual(["budget-1"]);
  });

  it("represents undefined ratios as null instead of synthetic zero", () => {
    const nullableRatios: Pick<ProjectProfitabilityContract, "grossMarginBps" | "overrunBps"> = {
      grossMarginBps: null,
      overrunBps: null,
    };
    expect(Object.values(nullableRatios)).toEqual([null, null]);
  });
});
