import { expect, test, type Page, type Route } from "@playwright/test";

const envelope = (data: unknown) => ({
  apiVersion: "v1",
  requestId: "erp630",
  organizationId: "naai",
  data,
});
const reply = (route: Route, data: unknown) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(envelope(data)),
  });
const common = {
  basis: "accrual",
  range: { startsOn: "2026-08-01", endsOn: "2026-08-31" },
  asOfInstant: "2026-08-31T16:59:59.999Z",
  framework: "TT133",
  mappingVersion: { id: "mapping-1", version: 1 },
  sourceFingerprint: "a".repeat(64),
  sourceLineCount: 8,
  unmappedAccountCodes: [],
};
const line = (lineCode: string, label: string, amountMinor: string) => ({
  lineCode,
  label,
  amountMinor,
  sourceLineCount: 1,
  drillDown: { statement: "profit_and_loss", lineCode },
});
const pnl = {
  ...common,
  statement: "profit_and_loss",
  final: true,
  lines: [
    line("revenue", "Doanh thu", "100000000"),
    line("direct_cost", "Chi phí trực tiếp", "40000000"),
    line("gross_profit", "Gross profit", "60000000"),
    line("opex", "OPEX", "20000000"),
    line("operating_profit", "Operating profit", "40000000"),
    line("net_profit", "Net profit", "38000000"),
  ],
  totalMinor: "38000000",
};
const balance = {
  ...common,
  statement: "balance_sheet",
  range: { startsOn: null, endsOn: "2026-08-31" },
  final: false,
  lines: [
    line("assets", "Tổng tài sản", "500000000"),
    line("liabilities", "Nợ phải trả", "180000000"),
    line("equity", "Vốn chủ sở hữu", "319999999"),
  ],
  equation: {
    assetsMinor: "500000000",
    liabilitiesMinor: "180000000",
    equityMinor: "319999999",
    differenceMinor: "1",
    balanced: false,
  },
};
const cashFlow = {
  ...common,
  statement: "cash_flow",
  basis: "cash",
  method: "direct",
  final: true,
  lines: [
    line("operating", "Operating", "50000000"),
    line("investing", "Investing", "-20000000"),
    line("financing", "Financing", "30000000"),
  ],
  openingCashMinor: "40000000",
  operatingCashFlowMinor: "50000000",
  investingCashFlowMinor: "-20000000",
  financingCashFlowMinor: "30000000",
  netCashMovementMinor: "60000000",
  closingCashMinor: "100000000",
  exceptions: [],
};
const vat = {
  ...common,
  statement: "vat_reconciliation",
  final: false,
  lines: [
    line("output_vat", "VAT đầu ra", "20000000"),
    line("input_vat", "VAT đầu vào", "12000000"),
  ],
  totals: {
    outputVatMinor: "20000000",
    inputVatMinor: "12000000",
    eligibleInputVatMinor: "8000000",
    ineligibleInputVatMinor: "3000000",
    unreviewedInputVatMinor: "1000000",
    netVatPayableMinor: "12000000",
  },
  controls: {
    unreviewedExpenseLineCount: "1",
    missingEvidenceExpenseCount: "1",
    differenceMinor: "0",
  },
};
const drilldown = {
  statement: "profit_and_loss",
  lineCode: "revenue",
  count: 1,
  sourceFingerprint: "a".repeat(64),
  items: [
    {
      journalId: "journal-1",
      journalVersion: "1",
      journalDate: "2026-08-12",
      postedAt: "2026-08-12T02:00:00Z",
      lineNumber: 1,
      accountCode: "5111",
      accountName: "Doanh thu dịch vụ",
      debitMinor: "0",
      creditMinor: "100000000",
      amountMinor: "100000000",
      sourceId: "invoice-1",
      sourceType: "sales_invoice",
      dimensions: { serviceLineCode: "web-app" },
    },
  ],
};
const exceptions = {
  items: [
    {
      id: "exception-1",
      expenseId: "expense-1",
      expenseDate: "2026-08-10",
      description: "Chi phí không có hóa đơn",
      partyName: "Nhà cung cấp mẫu",
      bookedMinor: "10000000",
      citEligibleMinor: "0",
      citIneligibleMinor: "10000000",
      vatEligibleMinor: "0",
      vatIneligibleMinor: "1000000",
      citState: "ineligible",
      vatState: "ineligible",
      evidenceState: "missing",
      reason: "Thiếu hóa đơn/chứng từ hợp lệ",
      sourceIds: ["expense-1"],
    },
  ],
};

async function install(page: Page, requestedUrls: string[] = []) {
  await page.addInitScript(() =>
    sessionStorage.setItem("naai-erp-admin-token", "financial-statements-e2e-token"),
  );
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/reports/financial-statements/profit-and-loss**",
    (route) => {
      requestedUrls.push(route.request().url());
      return reply(route, pnl);
    },
  );
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/reports/financial-statements/balance-sheet**",
    (route) => {
      requestedUrls.push(route.request().url());
      return reply(route, balance);
    },
  );
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/reports/financial-statements/cash-flow**",
    (route) => {
      requestedUrls.push(route.request().url());
      return reply(route, cashFlow);
    },
  );
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/reports/tax/vat-reconciliation**",
    (route) => {
      requestedUrls.push(route.request().url());
      return reply(route, vat);
    },
  );
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/reports/tax/expense-exceptions**",
    (route) => reply(route, exceptions),
  );
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/reports/financial-statements/drilldown**",
    (route) => reply(route, drilldown),
  );
}

test("@desktop opens dedicated financial statement pages from the landing", async ({ page }) => {
  await install(page);
  await page.goto("http://localhost:3000/reports/financial-statements");
  await expect(page.getByRole("heading", { name: "Báo cáo tài chính" })).toBeVisible();
  await page.getByRole("link", { name: "Mở báo cáo" }).first().click();
  await expect(page).toHaveURL(/profit-and-loss/);
  await expect(page.getByText("Accrual management").first()).toBeVisible();
  await expect(page.getByText("38.000.000 ₫").first()).toBeVisible();
});

test("@desktop persists P&L filters and drills to exact journal source", async ({ page }) => {
  await install(page);
  await page.goto("http://localhost:3000/reports/financial-statements/profit-and-loss/current");
  await page.getByRole("button", { name: "Bộ lọc" }).click();
  const sheet = page.getByRole("dialog", { name: "Bộ lọc báo cáo" });
  await sheet.getByLabel("Service line").fill("web-app");
  await sheet.getByRole("button", { name: "Áp dụng" }).click();
  await expect(page).toHaveURL(/serviceLineCode=web-app/);
  await page.getByRole("button", { name: "Xem nguồn" }).first().click();
  const drawer = page.getByRole("dialog", { name: /Nguồn/ });
  await expect(drawer.getByText("5111 · Doanh thu dịch vụ")).toBeVisible();
  await expect(drawer.getByText("invoice-1")).toBeVisible();
});

test("@desktop blocks an out-of-balance Balance Sheet without a hidden plug", async ({ page }) => {
  await install(page);
  await page.goto("http://localhost:3000/reports/financial-statements/balance-sheet/today");
  await expect(page.getByText(/Balance Sheet lệch 1 minor units/)).toBeVisible();
  await expect(page.getByText("Không có hidden plug.")).toBeVisible();
  await expect(page.getByText("1 ₫").first()).toBeVisible();
});

test("@desktop separates direct cash flow and VAT readiness controls", async ({ page }) => {
  await install(page);
  await page.goto("http://localhost:3000/reports/financial-statements/cash-flow/current");
  await expect(page.getByText("Operating").first()).toBeVisible();
  await expect(page.getByText("Investing").first()).toBeVisible();
  await expect(page.getByText("Financing").first()).toBeVisible();
  await expect(page.getByText("60.000.000 ₫").first()).toBeVisible();
  await page.goto("http://localhost:3000/reports/tax/vat-reconciliation/current");
  await expect(page.getByText("12.000.000 ₫").first()).toBeVisible();
  await expect(page.getByText("Báo cáo chưa sẵn sàng")).toBeVisible();
});

test("@desktop maps dynamic statement periods into canonical API dates", async ({ page }) => {
  const requestedUrls: string[] = [];
  await install(page, requestedUrls);

  await page.goto("http://localhost:3000/reports/financial-statements/profit-and-loss/CAL-2025-01");
  await expect(page.getByText("38.000.000 ₫").first()).toBeVisible();
  const pnlUrl = requestedUrls.find((url) => url.includes("profit-and-loss"));
  expect(pnlUrl).toContain("startsOn=2025-01-01");
  expect(pnlUrl).toContain("endsOn=2025-01-31");
  expect(pnlUrl).toContain("asOfInstant=2025-01-31T16%3A59%3A59.999Z");

  await page.goto("http://localhost:3000/reports/financial-statements/balance-sheet/2025-02-28");
  await expect(page.getByText(/Balance Sheet lệch 1 minor units/)).toBeVisible();
  const balanceUrl = requestedUrls.find((url) => url.includes("balance-sheet"));
  expect(balanceUrl).toContain("endsOn=2025-02-28");
  expect(balanceUrl).toContain("asOfInstant=2025-02-28T16%3A59%3A59.999Z");
});

test("@desktop exposes independent accounting CIT VAT and evidence states", async ({ page }) => {
  await install(page);
  await page.goto("http://localhost:3000/reports/tax/expense-exceptions");
  await expect(page.getByText("Chi phí không có hóa đơn")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Đã book" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "CIT deductible" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "VAT eligible" })).toBeVisible();
  await expect(page.getByText("Thiếu hóa đơn/chứng từ hợp lệ")).toBeVisible();
});

test("@mobile statement pages keep filters and tables inside the viewport", async ({ page }) => {
  await install(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000/reports/financial-statements/profit-and-loss/current");
  await page.getByRole("button", { name: "Bộ lọc" }).click();
  await expect(
    page.getByRole("dialog", { name: "Bộ lọc báo cáo" }).getByRole("button", { name: "Áp dụng" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
