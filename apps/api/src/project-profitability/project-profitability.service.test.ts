import { describe, expect, it, vi } from "vitest";
import type { MasterDataService } from "../master-data/master-data.service.js";
import { ProjectProfitabilityService } from "./project-profitability.service.js";
import type { ProjectProfitabilityStore } from "./project-profitability.types.js";

const context = {
  organizationId: "org-profit",
  actorId: "viewer",
  roles: ["viewer"],
  correlationId: "corr-profit",
};

const source = (projectId: string, clientId = "client-a") => ({
  organizationId: "org-profit",
  projectId,
  projectCode: projectId.toUpperCase(),
  projectName: `Project ${projectId}`,
  clientId,
  clientName: clientId,
  serviceLineCode: projectId === "p1" ? "web-app" : undefined,
  serviceLineName: projectId === "p1" ? "Web app" : undefined,
  accountOwnerId: "owner-a",
  accountOwnerName: "Owner A",
  startsOn: "2026-08-01",
  endsOn: "2026-08-31",
  currency: "VND",
  recognizedRevenueMinor: projectId === "p1" ? 100n : 50n,
  invoicedRevenueMinor: 90n,
  collectedRevenueMinor: 70n,
  directProjectCostMinor: 40n,
  variableOverheadMinor: 10n,
  fixedOverheadMinor: 5n,
  budgetRevenueMinor: 100n,
  budgetCostMinor: 45n,
  unbilledWorkMinor: projectId === "p1" ? 10n : 0n,
  overdueArMinor: 0n,
  billableMinutes: 60,
  projectMinutes: 90,
  availableMinutes: 120,
  missingDimensionSourceIds: projectId === "p1" ? [] : ["missing-1"],
  drilldown: {
    recognitionEventIds: [],
    invoiceIds: [],
    reconciliationIds: [],
    directCostItemIds: [],
    overheadAllocationRunIds: [],
    overheadAllocationSplitIds: [],
    timesheetIds: [],
    budgetVersionIds: [],
    journalIds: [],
  },
  breakdown: {
    revenueBreakdown: [],
    directCostBreakdown: [],
    overheadBreakdown: [],
    glTie: {},
  },
});

describe("ERP-540 project profitability service", () => {
  const store = {
    list: vi.fn().mockResolvedValue([source("p1"), source("p2")]),
    get: vi.fn().mockResolvedValue(source("p1")),
  } satisfies ProjectProfitabilityStore;
  const master = {
    authenticate: vi.fn().mockResolvedValue(context),
  } as unknown as MasterDataService;
  const service = new ProjectProfitabilityService(store, master);

  it("accepts canonical and UI query aliases and rejects invalid ranges", () => {
    expect(service.parseQuery({ startsOn: "2026-08-01", endsOn: "2026-08-31" })).toMatchObject({
      asOf: "2026-08-31",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
    });
    expect(
      service.parseQuery({
        asOf: "2026-08-31",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        confidenceCode: "unbilled_work",
      }),
    ).toMatchObject({ confidenceFlag: "unbilled_work" });
    expect(() => service.parseQuery({ asOf: "2026-08-01", periodStart: "2026-08-02" })).toThrow(
      "VALIDATION_FAILED",
    );
  });

  it("filters confidence flags and recalculates client group ratios from summed numerators", async () => {
    const response = await service.list(
      context,
      service.parseQuery({
        startsOn: "2026-08-01",
        endsOn: "2026-08-31",
        groupBy: "client",
      }),
    );
    expect(response.data.items).toHaveLength(2);
    expect(response.data.groups).toEqual([
      expect.objectContaining({
        key: "client-a",
        recognizedRevenueMinor: "150",
        grossMarginMinor: "70",
        grossMarginBps: 4667,
        fullyLoadedProfitMinor: "40",
      }),
    ]);
    const flagged = await service.list(
      context,
      service.parseQuery({
        startsOn: "2026-08-01",
        endsOn: "2026-08-31",
        confidenceCode: "missing_dimensions",
      }),
    );
    expect(flagged.data.items.map((item) => item.projectId)).toEqual(["p2"]);
  });

  it("serializes bigint values and includes detail GL controls", async () => {
    const response = await service.get(
      context,
      "p1",
      service.parseQuery({ startsOn: "2026-08-01", endsOn: "2026-08-31" }),
    );
    expect(response.data).toMatchObject({
      schemaVersion: 1,
      recognizedRevenueMinor: "100",
      grossMarginMinor: "60",
      contributionMarginMinor: "50",
      fullyLoadedProfitMinor: "45",
      utilizationBps: 5000,
      glTie: {},
    });
  });
});
