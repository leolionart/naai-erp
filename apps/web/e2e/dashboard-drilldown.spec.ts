import { expect, test, type Page, type Route } from "@playwright/test";

const env = (data: unknown) => ({
  apiVersion: "v1",
  requestId: "erp700",
  organizationId: "naai",
  data,
});
const reply = (route: Route, data: unknown) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(env(data)) });

async function install(page: Page, requestedUrls: string[] = []) {
  await page.addInitScript(() => sessionStorage.setItem("naai-erp-admin-token", "erp700-token"));
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/master-data/dimensions**",
    (route) =>
      reply(route, {
        items: [{ kind: "service_line", code: "web-app", name: "Web app", is_active: true }],
      }),
  );
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/reports/executive-metrics**",
    (route) => {
      requestedUrls.push(route.request().url());
      reply(route, {
        currency: "VND",
        period: { startsOn: "2026-08-01", endsOn: "2026-08-31", asOfDate: "2026-08-31" },
        dimensions: {},
        formulaVersion: "executive-metrics-v1",
        policyVersionId: "policy-700",
        sourceBoundary: {
          ledgerCutoffFingerprint: "fingerprint-erp700",
          sourceIds: ["journal-700", "cash-ledger-700"],
        },
        ros: {
          status: "available",
          formulaVersion: "signed-revenue-profitability-v1",
          numeratorMinor: "38000000",
          denominatorMinor: "100000000",
          valueBps: 3800,
        },
        equityConsumed: {
          status: "available",
          formulaVersion: "accumulated-loss-over-contributed-capital-v1",
          numeratorMinor: "420000000",
          denominatorMinor: "1000000000",
          valueBps: 4200,
        },
        runwayMonthsThousandths: "4250",
        runwayFormulaVersion: "unrestricted-cash-over-reviewed-net-burn-v1",
        runwayStatus: "available",
        roi: [],
        equityRollForward: { status: "tied_out" },
      });
    },
  );
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/reports/performance-comparisons**",
    (route) => {
      requestedUrls.push(route.request().url());
      reply(route, {
        currency: "VND",
        formulaVersion: "performance-comparison-v1",
        period: {
          id: "CAL-2026-08",
          label: "Tháng 8",
          startsOn: "2026-08-01",
          endsOn: "2026-08-31",
        },
        sourceIds: ["recognition-700", "target-700"],
        confidenceFlags: [
          {
            code: "missing_forecast",
            severity: "warning",
            reason: "Forecast đang chờ publish",
            sourceIds: ["forecast-draft-700"],
          },
        ],
        actualVsFullTarget: {
          status: "available",
          formulaVersion: "performance-comparison-v1",
          numeratorMinor: "100000000",
          denominatorMinor: "120000000",
          varianceMinor: "-20000000",
          ratioBps: 8333,
          numeratorSourceIds: ["recognition-700"],
          denominatorSourceIds: ["target-700"],
        },
        actualVsRetainedForecast: { status: "available", denominatorMinor: "110000000" },
        monthOverMonth: { denominatorMinor: "90000000" },
      });
    },
  );
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/planning-actual-facts/summary**",
    (route) => {
      requestedUrls.push(route.request().url());
      const url = new URL(route.request().url());
      reply(route, {
        actualBasis: url.searchParams.get("actualBasis") ?? "invoiced",
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
        currency: "VND",
        amountMinor: "100000000",
        factCount: 3,
        sourceIds: ["actual-jan", "actual-feb", "actual-mar"],
      });
    },
  );
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/reports/project-profitability**",
    (route) =>
      reply(route, {
        currency: "VND",
        items: [
          {
            projectId: "project-700",
            confidenceCodes: ["budget_overrun"],
            confidenceFlags: [
              { code: "budget_overrun", severity: "critical", sourceIds: ["budget-700"] },
            ],
          },
        ],
        totals: { fullyLoadedProfitMinor: "40000000" },
      }),
  );
  await page.route("http://localhost:3001/api/v1/organizations/naai/reports/ar-aging**", (route) =>
    reply(route, {
      asOf: "2026-08-31",
      baseCurrency: "VND",
      baseOutstandingTotalMinor: "30000000",
      tieStatus: "tied",
      exceptions: [{ code: "MISSING_DUE_DATE", itemId: "ar-700", message: "Thiếu ngày đến hạn" }],
      items: [],
      bucketTotals: [],
      controlTies: [],
    }),
  );
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/reports/operating-dashboard**",
    (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );
}

async function installOperatingDashboard(page: Page) {
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/reports/operating-dashboard**",
    (route) =>
      reply(route, {
        schemaVersion: 1,
        asOf: "2026-08-31",
        currency: "VND",
        backlog: {
          projectCount: 2,
          contractedMinor: "300000000",
          invoicedMinor: "180000000",
          remainingMinor: "120000000",
          projects: [],
        },
        collections: {
          receivablesMinor: "45000000",
          creditSalesMinor: "270000000",
          dsoDays: 15,
          overdueMinor: "25000000",
          dueWithin7DaysMinor: "5000000",
          dueWithin30DaysMinor: "10000000",
          laterMinor: "5000000",
        },
        projectBurn: [
          {
            projectId: "project-700",
            code: "WEB-700",
            name: "Web App 700",
            actualCostMinor: "60000000",
            budgetCostMinor: "100000000",
            burnBps: 6000,
            estimateAtCompletionMinor: "100000000",
            eacMethod: "approved-direct-cost-budget",
          },
        ],
        clientConcentration: {
          totalRevenueMinor: "180000000",
          topClientShareBps: 6500,
          topThreeShareBps: 10000,
          clients: [
            { clientId: "client-700", clientName: "NAAI Client", revenueMinor: "117000000" },
          ],
        },
        financials: {
          revenueMinor: "180000000",
          expenseMinor: "80000000",
          netProfitMinor: "100000000",
          unrestrictedCashMinor: "75000000",
          rosBps: 5556,
          recognitionEventCount: 0,
          approvedBudgetCount: 0,
          postedOverheadRunCount: 0,
          source: "posted_ledger",
        },
        dataQuality: {
          pendingCount: 2,
          byFlag: [{ flag: "missing_project", count: 2 }],
          rows: [],
        },
        sourceControls: {
          accountingStatus: "unconfirmed_non_canonical",
          rowCount: 2,
          byKind: [{ kind: "profitability_control", count: 2 }],
          monthly: [
            {
              id: "profit-2024-12",
              kind: "profitability_control",
              period: "2024-12",
              revenueMinor: "70000000",
              receivedMinor: "60000000",
              expenseMinor: "45000000",
              profitMinor: "25000000",
            },
            {
              id: "profit-2025-01",
              kind: "profitability_control",
              period: "2025-01",
              revenueMinor: "80000000",
              receivedMinor: "70000000",
              expenseMinor: "50000000",
              profitMinor: "30000000",
            },
            {
              id: "profit-2025-02",
              kind: "profitability_control",
              period: "2025-02",
              revenueMinor: "95000000",
              receivedMinor: "85000000",
              expenseMinor: "55000000",
              profitMinor: "40000000",
            },
            {
              id: "profit-2025-03",
              kind: "profitability_control",
              period: "2025-03",
              revenueMinor: "105000000",
              receivedMinor: "90000000",
              expenseMinor: "60000000",
              profitMinor: "45000000",
            },
          ],
        },
      }),
  );
}

test("@desktop T-E2E-ERP-700-001 renders exact API KPIs and preserves filters", async ({
  page,
}) => {
  const requestedUrls: string[] = [];
  await install(page, requestedUrls);
  await page.goto("http://localhost:3000/dashboard?periodId=CAL-2026-08");
  await expect(page.getByRole("heading", { name: "Tổng quan điều hành" })).toBeVisible();
  await expect(page.getByText("100.000.000 ₫").first()).toBeVisible();
  await expect(page.getByText("38%")).toBeVisible();
  await expect(page.getByText("4,25 tháng")).toBeVisible();
  await expect(page.getByText("3 tín hiệu cần rà soát")).toBeVisible();
  expect(requestedUrls.find((url) => url.includes("/reports/executive-metrics"))).toContain(
    "asOfInstant=2026-08-07T16%3A59%3A59.999Z",
  );
  expect(requestedUrls.find((url) => url.includes("/reports/performance-comparisons"))).toContain(
    "periodId=CAL-2026-08",
  );
  await page.getByRole("button", { name: "Bộ lọc" }).click();
  const filters = page.locator('[data-slot="popover-content"]');
  await filters.getByLabel("Mảng dịch vụ").click();
  await page.getByRole("option", { name: "Web app" }).click();
  await filters.getByRole("button", { name: "Áp dụng" }).click();
  await expect(page).toHaveURL(/serviceLineCode=web-app/);
  await page.getByRole("link", { name: "Giá trị đã xuất hóa đơn" }).first().click();
  await expect(page).toHaveURL(/reports\/project-profitability.*serviceLineCode=web-app/);
});

test("@desktop T-E2E-ERP-700-002 drills from KPI to sources and canonical report", async ({
  page,
}) => {
  await install(page);
  await page.goto("http://localhost:3000/dashboard/drilldown/ros?periodId=CAL-2026-08");
  await expect(page.getByRole("heading", { name: "ROS" })).toBeVisible();
  await expect(page.getByText("38%")).toBeVisible();
  await expect(page.getByText("fingerprint-erp700")).toBeVisible();
  await expect(page.getByText("journal-700")).toBeVisible();
  await expect(page.getByRole("link", { name: "Mở báo cáo nguồn" })).toHaveAttribute(
    "href",
    /executive-metrics\/profitability/,
  );
  await page.goto("http://localhost:3000/dashboard/finance-review?periodId=CAL-2026-08");
  await expect(page.getByText("budget_overrun")).toBeVisible();
  await expect(page.getByText("Thiếu ngày đến hạn")).toBeVisible();
  await expect(page.getByText("Forecast đang chờ publish")).toBeVisible();
});

test("@mobile dashboard and review queue avoid document overflow", async ({ page }) => {
  await install(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "/dashboard?periodId=CAL-2026-08",
    "/dashboard/finance-review?periodId=CAL-2026-08",
  ]) {
    await page.goto(`http://localhost:3000${route}`);
    await expect(page.getByRole("main")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test("@desktop uses operating dashboard read model instead of provisional fallback", async ({
  page,
}) => {
  await install(page);
  await installOperatingDashboard(page);
  await page.goto("http://localhost:3000/dashboard?periodId=CAL-2026-08");
  await expect(page.getByText("120.000.000 ₫")).toBeVisible();
  await expect(page.getByText("DSO: 15 ngày")).toBeVisible();
  await expect(page.getByText("Web App 700")).toBeVisible();
  await expect(page.getByText("approved-direct-cost-budget")).toBeVisible();
  await expect(page.getByText("Đang dùng dữ liệu fallback")).toHaveCount(0);
  await expect(page.getByText("2025-01", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("2025-01: 80.000.000 ₫", { exact: true })).toBeAttached();
  await expect(page.getByRole("img", { name: "Xu hướng doanh thu tương tác" })).toBeVisible();
  await page.getByRole("combobox", { name: "Khoảng thời gian" }).click();
  await page.getByRole("option", { name: "3 tháng gần nhất" }).click();
  await expect(page.getByText("2024-12", { exact: true })).toHaveCount(0);
  await expect(page.getByText("2025-03", { exact: true })).toBeVisible();
  await expect(page.getByText("2 dòng workbook chưa xác nhận kế toán")).toBeVisible();
});

test("@desktop selects the latest source-control period and invoiced basis by default", async ({
  page,
}) => {
  const requestedUrls: string[] = [];
  await install(page, requestedUrls);
  await installOperatingDashboard(page);
  await page.goto("http://localhost:3000/dashboard");

  await expect(page.getByText("2025-03", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("combobox").filter({ hasText: "Giá trị đã xuất hóa đơn" }),
  ).toBeVisible();
  expect(requestedUrls.find((url) => url.includes("performance-comparisons"))).toContain(
    "periodId=CAL-2025-03",
  );
  expect(requestedUrls.find((url) => url.includes("performance-comparisons"))).toContain(
    "actualBasis=invoiced",
  );
});

test("@desktop switches month quarter and year and queries aggregate actuals for the full range", async ({
  page,
}) => {
  const requestedUrls: string[] = [];
  await install(page, requestedUrls);
  await page.goto("http://localhost:3000/dashboard?periodId=CAL-2026-08&actualBasis=collected");

  await page.getByRole("radio", { name: "Quý" }).click();
  await expect(page).toHaveURL(/periodKind=quarter/);
  await expect(page).toHaveURL(/period=Q3%2F2026/);
  await expect(page).toHaveURL(/startsOn=2026-07-01/);
  await expect(page).toHaveURL(/endsOn=2026-09-30/);
  await expect(page).toHaveURL(/actualBasis=collected/);
  await expect
    .poll(() => requestedUrls.filter((url) => url.includes("planning-actual-facts/summary")).at(-1))
    .toContain("from=2026-07-01");
  expect(
    requestedUrls.filter((url) => url.includes("planning-actual-facts/summary")).at(-1),
  ).toContain("to=2026-08-07");

  await page.getByRole("radio", { name: "Năm" }).click();
  await expect(page).toHaveURL(/periodKind=year/);
  await expect(page).toHaveURL(/startsOn=2026-01-01/);
  await expect(page).toHaveURL(/endsOn=2026-12-31/);
  await expect
    .poll(() => requestedUrls.filter((url) => url.includes("planning-actual-facts/summary")).at(-1))
    .toContain("from=2026-01-01");
  expect(
    requestedUrls.filter((url) => url.includes("planning-actual-facts/summary")).at(-1),
  ).toContain("to=2026-08-07");

  await expect
    .poll(() => requestedUrls.filter((url) => url.includes("performance-comparisons")).at(-1))
    .toContain("periodId=CAL-2026-08");
  expect(requestedUrls.some((url) => /periodId=CAL-2026-(?:Q|year)/.test(url))).toBe(false);
});

test("@desktop surfaces executive metrics API failure without hiding other dashboard data", async ({
  page,
}) => {
  await install(page);
  await installOperatingDashboard(page);
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/reports/executive-metrics**",
    (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );
  await page.goto("http://localhost:3000/dashboard?periodId=CAL-2026-08");

  await expect(page.getByText("100.000.000 ₫", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("75.000.000 ₫", { exact: true })).toBeVisible();
  await expect(page.getByText("55,56%", { exact: true })).toBeVisible();
});

test("@desktop normalizes invalid dashboard date configuration before API requests", async ({
  page,
}) => {
  const requestedUrls: string[] = [];
  await install(page, requestedUrls);
  await page.goto(
    "http://localhost:3000/dashboard?periodId=invalid&startsOn=2026-09-01&endsOn=2026-08-01&asOfDate=2026-07-01",
  );
  await expect(page.getByRole("heading", { name: "Tổng quan điều hành" })).toBeVisible();
  await expect
    .poll(() => requestedUrls.some((url) => url.includes("executive-metrics")))
    .toBe(true);
  const executiveUrl = requestedUrls.find((url) => url.includes("executive-metrics"));
  expect(executiveUrl).toContain("startsOn=");
  expect(executiveUrl).toContain("endsOn=");
  expect(executiveUrl).toContain("asOfInstant=");
  const parsed = new URL(executiveUrl!);
  expect(parsed.searchParams.get("startsOn")! <= parsed.searchParams.get("endsOn")!).toBe(true);
  expect(parsed.searchParams.get("asOfInstant")!.slice(0, 10)).toBe(
    parsed.searchParams.get("endsOn"),
  );
});
