import { afterEach, describe, expect, it, vi } from "vitest";
import {
  actualSummaryQuery,
  dashboardMetricDrilldownHref,
  effectiveEndsOn,
  ownerSettlementDashboardAmounts,
  projectQuery,
  reportQuery,
  resolvedDashboardSearch,
  shouldShowNetCompanyFunds,
} from "./dashboard-workspaces";

afterEach(() => {
  vi.useRealTimers();
});

describe("dashboard reporting cutoff", () => {
  it("preserves the active dashboard query when opening a metric drill-down", () => {
    const query = new URLSearchParams(
      "periodId=CAL-2026-08&periodKind=year&startsOn=2026-01-01&endsOn=2026-12-31&asOfDate=2026-08-31&serviceLineCode=CONSULTING",
    );
    expect(dashboardMetricDrilldownHref("taxable-profit", query)).toBe(
      "/dashboard/drilldown/taxable-profit?periodId=CAL-2026-08&periodKind=year&startsOn=2026-01-01&endsOn=2026-12-31&asOfDate=2026-08-31&serviceLineCode=CONSULTING",
    );
    expect(dashboardMetricDrilldownHref("corporate-income-tax")).toBe(
      "/dashboard/drilldown/corporate-income-tax",
    );
  });

  it("never renders a negative company debt and separates company funds held by the owner", () => {
    expect(
      ownerSettlementDashboardAmounts({
        ownerPayableMinor: "-21836050",
        companyOwesOwnerMinor: "0",
        ownerHoldsCompanyFundsMinor: "21836050",
      }),
    ).toEqual({ companyOwesOwnerMinor: "0", ownerHoldsCompanyFundsMinor: "21836050" });
    expect(shouldShowNetCompanyFunds("0")).toBe(false);
    expect(shouldShowNetCompanyFunds("65438650")).toBe(true);
  });
  it("preserves the explicit historical asOfDate and clamps report ranges to it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T00:00:00.000Z"));
    const resolved = resolvedDashboardSearch(
      new URLSearchParams(
        "periodId=CAL-2026-08&actualBasis=invoiced&periodKind=year&startsOn=2026-01-01&endsOn=2026-12-31&asOfDate=2026-08-09",
      ),
    );

    expect(resolved.get("asOfDate")).toBe("2026-08-09");
    expect(resolved.get("endsOn")).toBe("2026-12-31");
    expect(effectiveEndsOn(resolved)).toBe("2026-08-09");
    expect(reportQuery(resolved).get("endsOn")).toBe("2026-08-09");
    expect(actualSummaryQuery(resolved).get("to")).toBe("2026-08-09");
    expect(projectQuery(resolved).get("periodEnd")).toBe("2026-08-09");
  });

  it("clamps a future asOfDate to today without rewriting the selected period end", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T00:00:00.000Z"));
    const resolved = resolvedDashboardSearch(
      new URLSearchParams(
        "periodId=CAL-2026-08&periodKind=year&startsOn=2026-01-01&endsOn=2026-12-31&asOfDate=2099-01-01",
      ),
    );

    expect(resolved.get("asOfDate")).toBe("2026-08-10");
    expect(resolved.get("endsOn")).toBe("2026-12-31");
    expect(effectiveEndsOn(resolved)).toBe("2026-08-10");
  });
});
