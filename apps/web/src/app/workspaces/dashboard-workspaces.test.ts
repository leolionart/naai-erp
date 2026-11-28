import { afterEach, describe, expect, it, vi } from "vitest";
import {
  actualSummaryQuery,
  dashboardMetricDrilldownHref,
  effectiveEndsOn,
  formatDashboardBalanceScope,
  formatDashboardPeriodScope,
  ownerSettlementDashboardAmounts,
  projectQuery,
  reportQuery,
  resolvedDashboardSearch,
  shouldShowNetCompanyFunds,
  metricCardVariantStyles,
} from "./dashboard-workspaces";
import { buildCitCardDescription, buildCitDrilldownFacts } from "./cit-estimate-presentation";
import { buildExpenseOverviewQueries } from "./focused-record-shared";

afterEach(() => {
  vi.useRealTimers();
});

describe("dashboard reporting cutoff", () => {
  it("keeps metric card variants contrast-safe for badges, arrows and trends", () => {
    expect(metricCardVariantStyles.primary.card).toContain("text-primary-foreground");
    expect(metricCardVariantStyles.primary.trend).toContain("primary-foreground");
    expect(metricCardVariantStyles.primary.badge).toContain("text-primary-foreground");
    expect(metricCardVariantStyles.primary.arrow).toContain("text-primary");
    expect(metricCardVariantStyles.danger.card).toContain("text-destructive-foreground");
    expect(metricCardVariantStyles.danger.trend).toContain("destructive-foreground");
    expect(metricCardVariantStyles.danger.badge).toContain("text-destructive-foreground");
    expect(metricCardVariantStyles.danger.arrow).toContain("text-destructive");
    expect(metricCardVariantStyles.surface.card).toContain("text-card-foreground");
    expect(metricCardVariantStyles.muted.card).toContain("text-card-foreground");
  });

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

  it("formats tiered CIT rate and assumption on dashboard card and drill-down facts", () => {
    expect(
      buildCitCardDescription({
        taxableProfitFormatted: "200.000.000 ₫",
        financials: {
          corporateIncomeTaxRateBps: 1500,
          corporateIncomeTaxAssumption:
            "Áp dụng bậc 15% theo Law 67/2025/QH15 căn cứ tổng doanh thu năm 2025 trên sổ cái: 1.500.000.000 ₫",
        },
      }),
    ).toBe(
      "Lợi nhuận tính thuế tạm tính 200.000.000 ₫ × thuế suất đã duyệt 15% · Áp dụng bậc 15% theo Law 67/2025/QH15 căn cứ tổng doanh thu năm 2025 trên sổ cái: 1.500.000.000 ₫",
    );

    const facts = buildCitDrilldownFacts({
      taxableProfitFormatted: "200.000.000 ₫",
      citUnreviewedFormatted: "0 ₫",
      priorYearRevenueFormatted: "1.500.000.000 ₫",
      financials: {
        corporateIncomeTaxRateBps: 1500,
        corporateIncomeTaxAssumption: "Áp dụng bậc 15% theo Law 67/2025/QH15",
      },
    });
    expect(facts).toEqual(
      expect.arrayContaining([
        { label: "Thuế suất TNDN", value: "15%" },
        { label: "Doanh thu năm trước liền kề", value: "1.500.000.000 ₫" },
        { label: "Giả định & căn cứ thuế suất", value: "Áp dụng bậc 15% theo Law 67/2025/QH15" },
      ]),
    );
  });

  it("builds expense overview queries without hardcoded limit=500 so dataAll never triggers LIMIT_INVALID", () => {
    const { documentsPath, expensesPath } = buildExpenseOverviewQueries(
      new URLSearchParams("startsOn=2026-01-01&endsOn=2026-12-31&state=posted"),
    );
    expect(documentsPath).toBe(
      "commercial-documents?startsOn=2026-01-01&endsOn=2026-12-31&state=posted&type=purchase_invoice",
    );
    expect(expensesPath).toBe("expenses?startsOn=2026-01-01&endsOn=2026-12-31&state=posted");
    expect(documentsPath).not.toContain("limit=");
    expect(expensesPath).not.toContain("limit=");
  });

  it("formats explicit period-filtered vs all-time cumulative balance scope badges for dashboard cards", () => {
    expect(
      formatDashboardPeriodScope(
        new URLSearchParams("periodKind=year&startsOn=2024-01-01&endsOn=2024-12-31"),
      ),
    ).toBe("Theo kỳ lọc · Năm 2024");
    expect(
      formatDashboardPeriodScope(
        new URLSearchParams("periodKind=quarter&startsOn=2026-07-01&endsOn=2026-09-30"),
      ),
    ).toBe("Theo kỳ lọc · Quý 3/2026");
    expect(
      formatDashboardPeriodScope(
        new URLSearchParams("periodKind=month&startsOn=2026-08-01&endsOn=2026-08-31"),
      ),
    ).toBe("Theo kỳ lọc · Tháng 08/2026");

    expect(
      formatDashboardBalanceScope(new URLSearchParams("asOfDate=2026-11-28"), "2026-11-28"),
    ).toBe("Số dư toàn thời gian");
    expect(
      formatDashboardBalanceScope(new URLSearchParams("asOfDate=2026-08-09"), "2026-11-28"),
    ).toBe("Số dư lũy kế đến 09/08/2026");
  });
});
