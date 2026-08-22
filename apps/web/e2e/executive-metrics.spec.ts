import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const ratio = (numeratorMinor: string, denominatorMinor: string, valueBps: number) => ({
  status: "available",
  formulaVersion: "signed-revenue-profitability-v1",
  numeratorMinor,
  denominatorMinor,
  valueBps,
});

const executiveReport = {
  schemaVersion: 1,
  organizationId: "naai",
  policyVersionId: "naai-executive-metrics:1",
  currency: "VND",
  period: { startsOn: "2026-01-01", endsOn: "2026-08-09", asOfDate: "2026-08-09" },
  dimensions: {},
  sourceBoundary: { ledgerCutoffFingerprint: "a".repeat(64), sourceIds: ["ledger:2026"] },
  formulaVersion: "executive-metrics-v1",
  grossMargin: ratio("60000000", "100000000", 6000),
  operatingMargin: ratio("30000000", "100000000", 3000),
  netMargin: ratio("20000000", "100000000", 2000),
  ros: ratio("20000000", "100000000", 2000),
  roe: ratio("20000000", "80000000", 2500),
  roa: ratio("20000000", "200000000", 1000),
  accumulatedLossMinor: "25000000",
  contributedCapitalMinor: "100000000",
  ownerLoansMinor: "40000000",
  equityConsumed: ratio("25000000", "100000000", 2500),
  equityRollForward: {
    controlVersion: "equity-roll-forward-control-v1",
    openingEquityMinor: "80000000",
    contributionsMinor: "0",
    withdrawalsMinor: "0",
    profitOrLossMinor: "20000000",
    reviewedAdjustmentsMinor: "0",
    expectedClosingEquityMinor: "100000000",
    actualClosingEquityMinor: "100000000",
    differenceMinor: "0",
    status: "tied_out",
  },
  burnFormulaVersion: "signed-average-operating-cash-flow-v1",
  averageOperatingNetCashFlowMinor: "-10000000",
  netBurnMinor: "10000000",
  unrestrictedCashMinor: "50000000",
  restrictedCashMinor: "0",
  runwayFormulaVersion: "unrestricted-cash-over-reviewed-net-burn-v1",
  runwayMonthsThousandths: "5000",
  runwayStatus: "available",
  roi: [],
};

async function mockReport(page: Page) {
  await page.route("**/reports/executive-metrics?**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: executiveReport }),
    }),
  );
}

test("@desktop opens every executive metric group from its dedicated landing", async ({ page }) => {
  await page.goto("http://localhost:3000/reports/executive-metrics");
  await expect(page.getByRole("heading", { name: "Chỉ số điều hành" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mở phân tích" })).toHaveCount(5);

  for (const [route, heading] of [
    ["equity", "Vốn chủ sở hữu"],
    ["liquidity", "Thanh khoản & runway"],
    ["profitability", "Khả năng sinh lời"],
    ["returns", "Hiệu quả vốn & tài sản"],
    ["roi", "ROI theo mục đích"],
  ] as const) {
    await page.goto(`http://localhost:3000/reports/executive-metrics/${route}`);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByText("Bảng chỉ số exact")).toBeVisible();
  }
});

test("@desktop persists executive filters in the URL and opens source Dialog", async ({ page }) => {
  await mockReport(page);
  await page.goto("http://localhost:3000/reports/executive-metrics/equity");
  await expect(page.getByRole("heading", { name: "Vốn chủ sở hữu" })).toBeVisible();
  await expect(page.getByText("Công nợ/vãng lai chủ")).toBeVisible();
  await page.getByRole("button", { name: "Bộ lọc" }).click();
  const sheet = page.locator('[data-slot="popover-content"]');
  await sheet.getByLabel("Service line").fill("web-app");
  await sheet.getByRole("button", { name: "Áp dụng" }).click();
  await expect(page).toHaveURL(/serviceLineCode=web-app/);
  await expect(page.getByText("Service line: web-app")).toBeVisible();

  await page.getByRole("button", { name: "Xem nguồn" }).first().click();
  const drawer = page.getByRole("dialog", { name: /Nguồn chỉ số/ });
  await expect(drawer).toBeVisible();
});

test("@desktop shows valid solopreneur management metrics immediately without a review gate", async ({
  page,
}) => {
  await page.route("**/organization-workflow-policy", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { operatingMode: "solopreneur" } }),
    }),
  );
  const report = {
    ...executiveReport,
    netBurnMinor: null,
    runwayMonthsThousandths: null,
    runwayStatus: "missing_reviewed_burn",
  };
  await page.route("**/reports/executive-metrics?**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: report }),
    }),
  );

  await page.goto("http://localhost:3000/reports/executive-metrics/liquidity");
  await expect(page.getByText("Số liệu cập nhật ngay")).toBeVisible();
  await expect(page.getByText("Có chỉ số cần review")).toHaveCount(0);
  await expect(page.getByText("Cần review")).toHaveCount(0);
});

test("@desktop shows an honest empty state when ROI has no reviewed facts", async ({ page }) => {
  await mockReport(page);
  await page.goto("http://localhost:3000/reports/executive-metrics/roi");
  await expect(page.getByText("Chưa cấu hình ROI")).toBeVisible();
  await expect(page.getByText("ROI dự án Web App A")).toHaveCount(0);
  await expect(page.getByText("Dữ liệu phát triển")).toHaveCount(0);
});

test("@desktop never substitutes fixture metrics when the report API fails", async ({ page }) => {
  await page.route("**/reports/executive-metrics?**", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "EXECUTIVE_METRIC_POLICY_NOT_FOUND",
          message: "EXECUTIVE_METRIC_POLICY_NOT_FOUND",
        },
      }),
    }),
  );
  await page.goto("http://localhost:3000/reports/executive-metrics/equity");
  await expect(page.getByText("Không có số liệu mẫu nào được dùng")).toBeVisible();
  await expect(page.getByText("Dữ liệu phát triển")).toHaveCount(0);
  await expect(page.getByText("Lỗ lũy kế")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Kiểm tra policy và mapping" })).toBeVisible();
});

test("@desktop lets a solopreneur self-approve an executive metric policy", async ({ page }) => {
  await page.route("**/organization-workflow-policy", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { operatingMode: "solopreneur" } }),
    });
  });
  await page.route("**/executive-metric-policies", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { items: [] } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { id: "naai-executive-metrics", version: 1, state: "draft" } }),
    });
  });
  await page.goto("http://localhost:3000/settings/executive-metrics");
  await expect(page.getByRole("heading", { name: "Cấu hình chỉ số điều hành" })).toBeVisible();
  await expect(page.getByText("Chưa có chính sách đã duyệt")).toBeVisible();
  await expect(
    page.getByText(/năm nhóm chỉ số quản trị được dùng ngay cho chủ doanh nghiệp/i),
  ).toBeVisible();
  await expect(page.getByText(/chủ doanh nghiệp dùng số liệu quản trị ngay/i)).toBeVisible();
  await expect(page.getByLabel("Mapping tài khoản")).toHaveValue(/owner_loan=3388-OWNER/);
  await expect(page.getByRole("button", { name: "Tạo phiên bản chính sách nháp" })).toBeVisible();
});

test("@desktop retains independent approval guidance for a controlled organization", async ({
  page,
}) => {
  await page.route("**/organization-workflow-policy", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { operatingMode: "controlled" } }),
    });
  });
  await page.route("**/executive-metric-policies", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { items: [] } }),
    });
  });
  await page.goto("http://localhost:3000/settings/executive-metrics");
  await expect(page.getByText(/yêu cầu người duyệt khác người tạo/)).toBeVisible();
  await expect(page.getByText(/chính sách được một người khác phê duyệt/)).toBeVisible();
});

test("@mobile executive metrics keep filters and exact table within the viewport", async ({
  page,
}) => {
  await mockReport(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000/reports/executive-metrics/liquidity");
  await expect(page.getByRole("heading", { name: "Thanh khoản & runway" })).toBeVisible();
  await page.getByRole("button", { name: "Bộ lọc" }).click();
  await expect(
    page.locator('[data-slot="popover-content"]').getByRole("button", { name: "Áp dụng" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Xem nguồn" }).first().click();
  await expect(page.getByRole("dialog", { name: /Nguồn chỉ số/ })).toBeVisible();
});
