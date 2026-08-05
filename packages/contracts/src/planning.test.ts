import { describe, expect, it } from "vitest";

import {
  PLANNING_CONTRACT_VERSION,
  type CreateForecastVersionRequest,
  type RevenueTargetVersionContract,
} from "./planning.js";

describe("planning contracts", () => {
  it("exposes exact target money and the selected actual basis", () => {
    const target: RevenueTargetVersionContract = {
      schemaVersion: PLANNING_CONTRACT_VERSION,
      id: "target-1",
      versionNumber: 1,
      periodKind: "month",
      startsOn: "2026-08-01",
      endsOn: "2026-08-31",
      actualBasis: "recognized",
      currency: "VND",
      amountMinor: "1000000000000000001",
      dimensions: { serviceLineCode: "web-app" },
      state: "draft",
      resourceVersion: "1",
      nextActions: ["publish"],
    };
    expect(target.amountMinor).toBe("1000000000000000001");
    expect(target.actualBasis).toBe("recognized");
  });

  it("keeps scenario and snapshot metadata machine-readable", () => {
    const request: CreateForecastVersionRequest = {
      schemaVersion: PLANNING_CONTRACT_VERSION,
      versionNumber: 1,
      scenario: "custom",
      customScenarioName: "Founder stretch",
      snapshotKind: "month_end",
      asOfDate: "2026-08-31",
      startsOn: "2026-08-01",
      endsOn: "2026-12-31",
      actualBasis: "collected",
      currency: "VND",
      reason: "Monthly planning review",
    };
    expect(request).toMatchObject({ scenario: "custom", snapshotKind: "month_end" });
  });
});
