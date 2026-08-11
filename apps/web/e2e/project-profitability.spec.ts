import { expect, test, type Page, type Route } from "@playwright/test";

const env = (data: unknown) => ({
  apiVersion: "v1",
  requestId: "erp540",
  organizationId: "naai",
  data,
});
const reply = (route: Route, data: unknown) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(env(data)) });

const summary = {
  projectId: "project-web",
  projectCode: "WEB-001",
  projectName: "NAAI commerce platform",
  clientId: "client-naai",
  clientName: "NAAI Studio",
  serviceLineId: "web-app",
  serviceLineName: "Web app",
  accountOwnerId: "owner-ai",
  accountOwnerName: "Ái Trần",
  currency: "VND",
  recognizedRevenueMinor: "120000000",
  invoicedRevenueMinor: "100000000",
  collectedRevenueMinor: "70000000",
  directProjectCostMinor: "50000000",
  directCostMinor: "50000000",
  grossMarginMinor: "70000000",
  grossMarginBps: 5833,
  variableOverheadMinor: "10000000",
  contributionMarginMinor: "60000000",
  contributionMarginBps: 5000,
  fixedOverheadMinor: "20000000",
  fullyLoadedProfitMinor: "40000000",
  fullyLoadedMarginBps: 3333,
  realizedHourlyRateMinor: "600000",
  billableHours: 200,
  availableHours: 250,
  utilizationBps: 8000,
  budgetRevenueMinor: "110000000",
  budgetCostMinor: "70000000",
  overrunAmountMinor: "10000000",
  unbilledWorkMinor: "20000000",
  overdueArMinor: "30000000",
  confidenceCodes: ["unbilled_work", "overdue_ar", "budget_overrun"],
  confidenceFlags: [
    {
      code: "unbilled_work",
      severity: "warning",
      amountMinor: "20000000",
      sourceIds: ["recognition-1"],
    },
    { code: "overdue_ar", severity: "warning", amountMinor: "30000000", sourceIds: ["invoice-1"] },
    {
      code: "budget_overrun",
      severity: "critical",
      amountMinor: "10000000",
      sourceIds: ["budget-v1"],
    },
  ],
};

async function install(page: Page) {
  const requested: string[] = [];
  await page.addInitScript(() =>
    sessionStorage.setItem("naai-erp-admin-token", "project-profitability-e2e-token"),
  );
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/reports/project-profitability**",
    async (route) => {
      const url = new URL(route.request().url());
      requested.push(`${url.pathname}${url.search}`);
      if (url.pathname.endsWith("/projects/project-web")) {
        return reply(route, {
          ...summary,
          asOf: "2026-08-31",
          periodStart: "2026-08-01",
          periodEnd: "2026-08-31",
          revenueBreakdown: [
            {
              kind: "recognized",
              amountMinor: "120000000",
              sourceIds: ["recognition-1", "journal-revenue-1"],
            },
          ],
          directCostBreakdown: [
            { kind: "source_linked", amountMinor: "50000000", sourceIds: ["EXP-FREELANCER-001"] },
          ],
          confidenceDetails: [
            {
              code: "unbilled_work",
              severity: "warning",
              amountMinor: "20000000",
              sourceIds: ["recognition-1"],
              title: "20.000.000 ₫ chưa xuất hóa đơn",
              description: "Recognized work is ahead of invoicing.",
            },
            {
              code: "overdue_ar",
              severity: "warning",
              amountMinor: "30000000",
              sourceIds: ["invoice-1"],
              title: "30.000.000 ₫ công nợ quá hạn",
              description: "Review collection risk separately from profit.",
            },
            {
              code: "budget_overrun",
              severity: "critical",
              amountMinor: "10000000",
              sourceIds: ["budget-v1"],
              title: "Vượt ngân sách 10.000.000 ₫",
              description: "Actual cost is above approved budget.",
            },
          ],
          glTie: {
            basis: "posted",
            recognizedRevenue: {
              sourceMinor: "120000000",
              ledgerMinor: "120000000",
              differenceMinor: "0",
              status: "tied_out",
            },
            directProjectCost: {
              sourceMinor: "50000000",
              ledgerMinor: "50000000",
              differenceMinor: "0",
              status: "tied_out",
              coverage: "full",
              nonGlManagementCostMinor: "0",
              note: "",
            },
            allocatedOverhead: {
              sourceMinor: "30000000",
              ledgerMinor: "30000000",
              differenceMinor: "0",
              status: "tied_out",
            },
          },
        });
      }
      return reply(route, {
        asOf: "2026-08-31",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        currency: "VND",
        items: [summary],
        totals: {
          projectCount: 1,
          recognizedRevenueMinor: "120000000",
          directCostMinor: "50000000",
          variableOverheadMinor: "10000000",
          fixedOverheadMinor: "20000000",
          grossMarginMinor: "70000000",
          contributionMarginMinor: "60000000",
          fullyLoadedProfitMinor: "40000000",
        },
      });
    },
  );
  return requested;
}

test("@desktop T-E2E-ERP-540-001 shows reviewed profitability layers and confidence flags", async ({
  page,
}) => {
  await install(page);
  await page.goto(
    "http://localhost:3000/reports/project-profitability?asOf=2026-08-31&periodStart=2026-08-01&periodEnd=2026-08-31",
  );
  await expect(page.getByText("120.000.000 ₫").first()).toBeVisible();
  await expect(page.getByText("Gross margin", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Doanh thu chưa xuất hóa đơn")).toBeVisible();
  await page.getByRole("link", { name: /WEB-001/ }).click();
  await expect(page).toHaveURL(/\/reports\/project-profitability\/projects\/project-web/);
  const main = page.locator("#main-content");
  await expect(main.getByText("Chi phí thực tế")).toBeVisible();
  await expect(page.getByText("Vượt ngân sách dự kiến (Budget Overrun)")).toBeVisible();
  await expect(main.getByText("Đã đối soát")).toHaveCount(3);
});

test("@desktop keeps report filters in the URL", async ({ page }) => {
  const requested = await install(page);
  await page.goto("http://localhost:3000/reports/project-profitability");
  await page.getByRole("button", { name: "Bộ lọc báo cáo" }).click();
  const sheet = page.locator('[data-slot="popover-content"]');
  await sheet.getByLabel("Từ ngày").fill("2026-07-01");
  await sheet.getByLabel("Đến ngày").fill("2026-07-31");
  await sheet.getByLabel("Client ID").fill("client-naai");
  await sheet.locator("form").evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(page).toHaveURL(/periodStart=2026-07-01/);
  await expect(page).toHaveURL(/periodEnd=2026-07-31/);
  await expect(page).toHaveURL(/clientId=client-naai/);
  await expect.poll(() => requested.some((url) => url.includes("clientId=client-naai"))).toBe(true);
});

test("@mobile profitability queue and drill-down avoid body overflow", async ({ page }) => {
  await install(page);
  for (const path of [
    "/reports/project-profitability?asOf=2026-08-31&periodStart=2026-08-01&periodEnd=2026-08-31",
    "/reports/project-profitability/projects/project-web?asOf=2026-08-31&periodStart=2026-08-01&periodEnd=2026-08-31",
  ]) {
    await page.goto(`http://localhost:3000${path}`);
    await page.waitForLoadState("networkidle");
    const size = await page.evaluate(() => ({
      body: document.body.scrollWidth,
      viewport: innerWidth,
    }));
    expect(size.body).toBeLessThanOrEqual(size.viewport + 1);
  }
});
