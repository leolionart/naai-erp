import { describe, expect, it } from "vitest";
import { buildServiceBusinessMetrics } from "./service-business-metrics.js";

const base = () => ({
  organizationId: "naai",
  startsOn: "2026-08-01",
  endsOn: "2026-08-31",
  asOfDate: "2026-08-31",
  currency: "vnd",
  creditRevenueMinor: 3_100n,
  averageMonthlyRecognizedRevenueMinor: 300n,
  contracts: [
    {
      id: "contract-active",
      clientId: "client-a",
      projectId: "project-a",
      status: "active" as const,
      contractedValueMinor: 1_000n,
      recognizedRevenueMinor: 400n,
    },
    {
      id: "contract-complete",
      clientId: "client-a",
      projectId: "project-b",
      status: "completed" as const,
      contractedValueMinor: 500n,
      recognizedRevenueMinor: 500n,
    },
    {
      id: "contract-cancelled",
      clientId: "client-b",
      projectId: "project-c",
      status: "cancelled" as const,
      contractedValueMinor: 200n,
      recognizedRevenueMinor: 50n,
    },
  ],
  projects: [
    {
      projectId: "project-a",
      budgetCostMinor: 1_000n,
      actualCostMinor: 400n,
      estimateToCompleteMinor: 500n,
    },
  ],
  clients: [
    {
      clientId: "client-a",
      recognizedRevenueMinor: 700n,
      accountsReceivableMinor: 400n,
      overdueAccountsReceivableMinor: 200n,
    },
    {
      clientId: "client-b",
      recognizedRevenueMinor: 300n,
      accountsReceivableMinor: 100n,
      overdueAccountsReceivableMinor: 0n,
    },
  ],
  revenueMix: [
    { sourceId: "retainer", kind: "recurring" as const, recognizedRevenueMinor: 600n },
    { sourceId: "project", kind: "one_off" as const, recognizedRevenueMinor: 400n },
  ],
});

describe("service business metrics", () => {
  it("calculates backlog, collection, delivery, concentration and revenue mix metrics", () => {
    const result = buildServiceBusinessMetrics(base());

    expect(result).toMatchObject({
      organizationId: "naai",
      currency: "VND",
      contractedValueMinor: 1_700n,
      remainingContractValueMinor: 600n,
      contractedBacklogMinor: 600n,
      backlogCoverageMonthsThousandths: 2_000n,
      accountsReceivableMinor: 500n,
      overdueAccountsReceivableMinor: 200n,
      dsoDaysThousandths: 5_000n,
      overdueArBps: 4_000,
      projectBudgetMinor: 1_000n,
      projectActualCostMinor: 400n,
      projectEstimateToCompleteMinor: 500n,
      projectEstimateAtCompletionMinor: 900n,
      projectBudgetBurnBps: 4_000,
      projectEacVarianceMinor: 100n,
      projectEacVarianceBps: 1_000,
      topClientRevenueBps: 7_000,
      topClientArBps: 8_000,
      revenueConcentrationHhiBps: 5_800,
      arConcentrationHhiBps: 6_800,
      recurringRevenueMinor: 600n,
      oneOffRevenueMinor: 400n,
      recurringRevenueBps: 6_000,
    });
    expect(result.confidenceFlags.map((flag) => flag.code)).toEqual([
      "high_overdue_ar",
      "high_client_revenue_concentration",
      "high_client_ar_concentration",
    ]);
  });

  it("returns null ratios for zero denominators and explains incomplete source data", () => {
    const result = buildServiceBusinessMetrics({
      ...base(),
      creditRevenueMinor: 0n,
      averageMonthlyRecognizedRevenueMinor: 0n,
      contracts: [
        {
          id: "contract-gap",
          status: "active",
          recognizedRevenueMinor: 10n,
        },
      ],
      projects: [{ projectId: "project-gap", actualCostMinor: 10n }],
      clients: [],
      revenueMix: [],
    });

    expect(result).toMatchObject({
      backlogCoverageMonthsThousandths: null,
      dsoDaysThousandths: null,
      overdueArBps: null,
      projectBudgetBurnBps: null,
      projectEacVarianceBps: null,
      recurringRevenueBps: null,
    });
    expect(result.confidenceFlags.map((flag) => flag.code)).toEqual([
      "missing_client",
      "missing_project",
      "missing_contract_value",
      "missing_project_budget",
      "missing_estimate_to_complete",
      "zero_credit_revenue",
      "zero_ar_balance",
    ]);
  });

  it("does not report negative backlog when recognition exceeds contracted value", () => {
    const result = buildServiceBusinessMetrics({
      ...base(),
      contracts: [
        {
          id: "contract-over",
          clientId: "client-a",
          projectId: "project-a",
          status: "active",
          contractedValueMinor: 100n,
          recognizedRevenueMinor: 125n,
        },
      ],
    });

    expect(result.remainingContractValueMinor).toBe(0n);
    expect(result.contractedBacklogMinor).toBe(0n);
    expect(result.confidenceFlags).toContainEqual({
      code: "contract_over_recognized",
      severity: "critical",
      sourceIds: ["contract-over"],
      amountMinor: 25n,
    });
  });

  it("rejects overdue AR above the corresponding AR balance", () => {
    expect(() =>
      buildServiceBusinessMetrics({
        ...base(),
        clients: [
          {
            clientId: "client-a",
            recognizedRevenueMinor: 100n,
            accountsReceivableMinor: 50n,
            overdueAccountsReceivableMinor: 51n,
          },
        ],
      }),
    ).toThrow("cannot exceed accounts receivable");
  });
});
