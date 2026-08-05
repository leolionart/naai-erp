import { describe, expect, it } from "vitest";

import {
  createForecastVersion,
  createRevenueTargetVersion,
  publishForecastVersion,
  publishRevenueTargetVersion,
  supersedeForecastVersion,
} from "./planning.js";

describe("planning targets and forecast versions", () => {
  it("T-FCT-001 versions exact monthly, quarterly and yearly targets with an explicit actual basis", () => {
    const monthly = createRevenueTargetVersion({
      organizationId: "org-naai",
      id: "target-2026-08-v1",
      versionNumber: 1,
      periodKind: "month",
      startsOn: "2026-08-01",
      endsOn: "2026-08-31",
      actualBasis: "recognized",
      currency: "vnd",
      amountMinor: 1_000_000_000_000_000_001n,
      dimensions: { teamId: "team-studio", serviceLineCode: "web-app", ownerId: "owner-1" },
    });
    const published = publishRevenueTargetVersion(
      monthly,
      [],
      "planner-1",
      "2026-07-25T09:00:00+07:00",
    );
    expect(published).toMatchObject({
      amountMinor: 1_000_000_000_000_000_001n,
      actualBasis: "recognized",
      currency: "VND",
      state: "published",
    });

    for (const target of [
      { periodKind: "quarter" as const, startsOn: "2026-07-01", endsOn: "2026-09-30" },
      { periodKind: "year" as const, startsOn: "2026-01-01", endsOn: "2026-12-31" },
    ]) {
      expect(
        createRevenueTargetVersion({
          ...target,
          organizationId: "org-naai",
          id: `target-${target.periodKind}`,
          versionNumber: 1,
          actualBasis: "collected",
          currency: "VND",
          amountMinor: 0n,
        }).endsOn,
      ).toBe(target.endsOn);
    }

    const revision = createRevenueTargetVersion({
      ...monthly,
      id: "target-2026-08-v2",
      versionNumber: 2,
      previousVersionId: published.id,
      amountMinor: 1_200_000n,
    });
    expect(
      publishRevenueTargetVersion(revision, [published], "planner-2", "2026-08-01T08:00:00Z")
        .versionNumber,
    ).toBe(2);
    expect(() =>
      publishRevenueTargetVersion(
        { ...revision, id: "bad", previousVersionId: "missing" },
        [published],
        "planner",
        "2026-08-01T08:00:00Z",
      ),
    ).toThrow("latest published");
  });

  it("rejects malformed target calendar periods and implicit bases", () => {
    expect(() =>
      createRevenueTargetVersion({
        organizationId: "org-naai",
        id: "bad-quarter",
        versionNumber: 1,
        periodKind: "quarter",
        startsOn: "2026-08-01",
        endsOn: "2026-10-31",
        actualBasis: "invoiced",
        currency: "VND",
        amountMinor: 1n,
      }),
    ).toThrow("quarter boundary");
  });

  it("T-FCT-002 keeps base, best, worst and custom scenarios separate from actuals", () => {
    const scenarios = ["base", "best", "worst"] as const;
    for (const scenario of scenarios) {
      const forecast = createForecastVersion({
        organizationId: "org-naai",
        id: `forecast-${scenario}`,
        versionNumber: 1,
        scenario,
        snapshotKind: "working",
        asOfDate: "2026-08-15",
        startsOn: "2026-08-01",
        endsOn: "2026-12-31",
        actualBasis: "recognized",
        currency: "VND",
      });
      expect(forecast.scenario).toBe(scenario);
      expect(forecast).not.toHaveProperty("actualAmountMinor");
    }
    expect(
      createForecastVersion({
        organizationId: "org-naai",
        id: "forecast-custom",
        versionNumber: 1,
        scenario: "custom",
        customScenarioName: "Founder stretch",
        snapshotKind: "working",
        asOfDate: "2026-08-15",
        startsOn: "2026-08-01",
        endsOn: "2026-12-31",
        actualBasis: "collected",
        currency: "VND",
      }).customScenarioName,
    ).toBe("Founder stretch");
  });

  it("retains immutable month-end forecast snapshots for accuracy review", () => {
    const snapshot = createForecastVersion({
      organizationId: "org-naai",
      id: "forecast-base-aug-v1",
      versionNumber: 1,
      scenario: "base",
      snapshotKind: "month_end",
      asOfDate: "2026-08-31",
      startsOn: "2026-08-01",
      endsOn: "2026-12-31",
      actualBasis: "recognized",
      currency: "VND",
    });
    const published = publishForecastVersion(
      snapshot,
      [],
      "planner-1",
      "2026-08-31T23:59:59+07:00",
    );
    expect(() => supersedeForecastVersion(published)).toThrow("immutable");
    expect(() =>
      publishForecastVersion(
        { ...snapshot, id: "duplicate", versionNumber: 2, previousVersionId: published.id },
        [published],
        "planner-2",
        "2026-09-01T00:00:00+07:00",
      ),
    ).toThrow("already exists");
    expect(() =>
      createForecastVersion({ ...snapshot, id: "midmonth", asOfDate: "2026-08-30" }),
    ).toThrow("month end");
  });
});
