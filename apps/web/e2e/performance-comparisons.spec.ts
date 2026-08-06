import { expect, test, type Page, type Route } from "@playwright/test";

const envelope = (data: unknown) => ({
  apiVersion: "v1",
  requestId: "erp620",
  organizationId: "naai",
  data,
});
const reply = (route: Route, data: unknown) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(envelope(data)),
  });

const line = (
  basis: string,
  numeratorMinor: string | null,
  denominatorMinor: string | null,
  varianceMinor: string | null,
  ratioBps: number | null,
  varianceBps: number | null,
  options: Readonly<{
    status?: "available" | "missing" | "zero_denominator";
    reason?: string;
  }> = {},
) => ({
  basis,
  formulaVersion: "performance-comparison-v1",
  nullPolicyVersion: "ratio-null-policy-v1",
  status: options.status ?? "available",
  ...(options.reason ? { reason: options.reason } : {}),
  numeratorMinor,
  denominatorMinor,
  varianceMinor,
  ratioBps,
  varianceBps,
  numeratorSourceIds: ["actual-recognition-1"],
  denominatorSourceIds: denominatorMinor === null ? [] : [`comparison-${basis}`],
});

const report = {
  schemaVersion: 1,
  organizationId: "naai",
  metricKey: "revenue",
  actualBasis: "recognized",
  currency: "VND",
  timezone: "Asia/Ho_Chi_Minh",
  asOfInstant: "2024-02-15T16:59:59Z",
  asOfLocalDate: "2024-02-15",
  period: {
    basis: "calendar",
    kind: "month",
    id: "2024-02",
    label: "Tháng 02/2024",
    startsOn: "2024-02-01",
    endsOn: "2024-02-29",
  },
  dimensions: {},
  formulaVersion: "performance-comparison-v1",
  prorationFormulaVersion: "inclusive-calendar-day-proration-v1",
  windowFormulaVersion: "comparable-window-v1",
  nullPolicyVersion: "ratio-null-policy-v1",
  currentWindow: {
    startsOn: "2024-02-01",
    endsOn: "2024-02-15",
    dayCount: 15,
    comparisonType: "current",
    derivation: "as_of",
    clamped: false,
  },
  momWindow: {
    startsOn: "2024-01-01",
    endsOn: "2024-01-15",
    dayCount: 15,
    comparisonType: "mom",
    derivation: "calendar_shift",
    clamped: false,
  },
  yoyWindow: {
    startsOn: "2023-02-01",
    endsOn: "2023-02-15",
    dayCount: 15,
    comparisonType: "yoy",
    derivation: "calendar_shift",
    clamped: false,
  },
  elapsedDays: 15,
  periodDays: 29,
  proratedTargetMinor: "150000000",
  actualVsProratedTarget: line(
    "actual_vs_prorated_target",
    "120000000",
    "150000000",
    "-30000000",
    8000,
    -2000,
  ),
  actualVsFullTarget: line(
    "actual_vs_full_target",
    "120000000",
    "290000000",
    "-170000000",
    4138,
    -5862,
  ),
  actualVsRetainedForecast: line(
    "actual_vs_retained_forecast",
    "120000000",
    "110000000",
    "10000000",
    10909,
    909,
  ),
  forecastVsFullTarget: line("forecast_vs_full_target", "270000000", "0", "270000000", null, null, {
    status: "zero_denominator",
    reason: "comparison_denominator_zero",
  }),
  monthOverMonth: line("month_over_month", "120000000", "100000000", "20000000", 12000, 2000),
  yearOverYear: line("year_over_year", "120000000", null, null, null, null, {
    status: "missing",
    reason: "denominator_missing:prior_year_missing",
  }),
  sourceIds: ["actual-recognition-1", "target-2024-02", "forecast-2024-02"],
  confidenceFlags: [
    {
      code: "missing_yoy_comparison",
      severity: "warning",
      reason: "Chưa có dữ liệu cùng kỳ",
      sourceIds: [],
    },
  ],
};

async function install(page: Page) {
  const requests: string[] = [];
  await page.addInitScript(() =>
    sessionStorage.setItem("naai-erp-admin-token", "performance-e2e-token"),
  );
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/reports/performance-comparisons**",
    async (route) => {
      requests.push(route.request().url());
      await reply(route, report);
    },
  );
  return requests;
}

test("@desktop shows selected basis MTD target and comparison N/A policy", async ({ page }) => {
  await install(page);
  await page.goto(
    "http://localhost:3000/reports/performance?periodId=CAL-2024-02&actualBasis=recognized",
  );
  await expect(page.getByText("Tháng 02/2024 · Doanh thu ghi nhận")).toBeVisible();
  await expect(page.getByText("120.000.000 ₫").first()).toBeVisible();
  await expect(page.getByText("150.000.000 ₫").first()).toBeVisible();
  await expect(page.getByText("290.000.000 ₫").first()).toBeVisible();
  await expect(page.getByText("Actual vs retained forecast")).toBeVisible();
  await expect(page.getByText("110.000.000 ₫")).toBeVisible();
  await expect(page.getByText("Chưa có dữ liệu cùng kỳ năm trước")).toBeVisible();
  await expect(page.getByText("Mẫu số bằng 0 nên phần trăm không có ý nghĩa")).toBeVisible();
  await expect(page.getByRole("cell", { name: "N/A" }).first()).toBeVisible();
});

test("@desktop persists performance filters on URL and opens dedicated period page", async ({
  page,
}) => {
  const requests = await install(page);
  await page.goto("http://localhost:3000/reports/performance?periodId=CAL-2024-02");
  await page.getByRole("button", { name: "Bộ lọc" }).click();
  const sheet = page.getByRole("dialog", { name: "Bộ lọc hiệu suất" });
  await sheet.getByLabel("Actual basis").click();
  await page.getByRole("option", { name: "Collected" }).click();
  await sheet.getByLabel("Service line").fill("web-app");
  await sheet.getByRole("button", { name: "Áp dụng" }).click();
  await expect(page).toHaveURL(/actualBasis=collected/);
  await expect(page).toHaveURL(/serviceLineCode=web-app/);
  await expect.poll(() => requests.at(-1)).toContain("actualBasis=collected");
  await page.getByRole("link", { name: "Xem chi tiết kỳ" }).click();
  await expect(page).toHaveURL(/\/reports\/performance\/CAL-2024-02/);
});

test("@desktop opens source detail Drawer from dedicated comparison page", async ({ page }) => {
  await install(page);
  await page.goto(
    "http://localhost:3000/reports/performance/CAL-2024-02?actualBasis=recognized&periodBasis=calendar",
  );
  await expect(page.getByText("Chi tiết công thức và nguồn")).toBeVisible();
  await page.getByRole("button", { name: "Xem nguồn" }).first().click();
  const drawer = page.getByRole("dialog", { name: /Nguồn · Month over month/ });
  await expect(drawer.getByText("actual-recognition-1")).toBeVisible();
  await expect(drawer.getByText("comparison-month_over_month")).toBeVisible();
  await drawer.getByRole("button", { name: "Đóng" }).click();
  await expect(drawer).not.toBeVisible();
});

test("@mobile performance queue and detail avoid body overflow", async ({ page }) => {
  await install(page);
  for (const path of [
    "/reports/performance?periodId=CAL-2024-02&actualBasis=recognized",
    "/reports/performance/CAL-2024-02?actualBasis=recognized&periodBasis=calendar",
  ]) {
    await page.goto(`http://localhost:3000${path}`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
});
