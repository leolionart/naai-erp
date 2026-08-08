import { expect, test, type Page } from "@playwright/test";

async function authenticate(page: Page) {
  await page.addInitScript(() =>
    sessionStorage.setItem("naai-erp-admin-token", "accountant-export-token"),
  );
}

test("@desktop browses accountant exports and distinguishes review_required from final", async ({
  page,
}) => {
  await authenticate(page);
  await page.route("**/api/v1/organizations/naai/accountant-exports", (route) => route.abort());
  await page.goto("http://localhost:3000/reports/accountant-exports");
  await expect(page.getByRole("heading", { name: "Xuất dữ liệu kế toán" })).toBeVisible();
  await expect(
    page.locator('[data-slot="sidebar-content"]').getByRole("link", {
      name: "Xuất dữ liệu kế toán",
    }),
  ).toHaveCount(1);
  await expect(page.getByText("Dữ liệu preview được gắn nhãn")).toBeVisible();
  await expect(page.getByText("Cần rà soát · chưa phải bản cuối")).toBeVisible();

  await page.getByRole("button", { name: "Bộ lọc" }).click();
  const filters = page.locator('[data-slot="popover-content"]');
  await expect(filters.getByText("Thu hẹp danh sách theo định dạng bàn giao.")).toBeVisible();
  await filters.getByRole("button", { name: "Áp dụng" }).click();
  await expect(page.getByRole("link", { name: "Mở chi tiết" })).toBeVisible();
});

test("@desktop creates an XLSX export from the listing dialog", async ({ page }) => {
  const snapshot = {
    schemaVersion: 1,
    id: "snapshot-demo-2026-07",
    version: 1,
    organizationId: "naai",
    reportKind: "profit_and_loss",
    period: { startsOn: "2026-07-01", endsOn: "2026-07-31", asOfDate: "2026-07-31" },
    dimensions: {},
    accountingBasis: "accrual",
    framework: "VAS management pack",
    formulaVersions: {},
    mappingVersions: {},
    ledgerCutoff: {
      throughDate: "2026-07-31",
      maxPostedAt: "2026-08-02T10:30:00.000Z",
      journalCount: 42,
      lineCount: 126,
      sourceFingerprint: "snapshot-fixture",
    },
    sourceManifest: [],
    mappings: [],
    unresolvedItems: [{ code: "REVIEW", severity: "warning", sourceIds: [], message: "Review" }],
    state: "captured",
    readiness: "review_required",
    canonicalRequestJson: "{}",
    canonicalResultJson: "{}",
    requestHash: "request-hash",
    resultHash: "result-hash",
    snapshotHash: "snapshot-hash",
    createdAt: "2026-08-03T09:15:00.000Z",
    createdBy: "finance-demo",
  };
  await authenticate(page);
  await page.route("**/api/v1/organizations/naai/report-snapshots", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: { items: [snapshot] } }),
    }),
  );
  await page.route("**/api/v1/organizations/naai/accountant-exports", async (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ data: { id: "export-created", version: 1 } }),
      });
    }
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: { items: [] } }),
    });
  });
  await page.route(
    "**/api/v1/organizations/naai/accountant-exports/export-created?version=1",
    (route) => route.abort(),
  );

  await page.goto("http://localhost:3000/reports/accountant-exports");
  await page.getByRole("button", { name: "Tạo gói xuất" }).click();
  const dialog = page.getByRole("dialog", { name: "Cấu hình gói xuất" });
  await expect(dialog.getByText("Snapshot chưa final")).toBeVisible();
  await dialog.getByRole("button", { name: "Tạo gói xuất" }).click();
  await expect(page).toHaveURL(/\/reports\/accountant-exports\/export-created\?version=1/);
  await expect(page.getByRole("heading", { name: "Chi tiết gói xuất" })).toBeVisible();
});

test("@desktop inspects and reproduces a report snapshot", async ({ page }) => {
  await page.goto("http://localhost:3000/reports/report-snapshots/snapshot-demo-2026-07");
  await expect(page.getByRole("heading", { name: "Snapshot báo cáo" })).toBeVisible();
  await expect(page.getByText("Snapshot cần rà soát")).toBeVisible();
  await expect(page.getByText("6428", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Kiểm tra tái lập" }).click();
  await expect(page.getByText("Tái lập thành công")).toBeVisible();
});

test("@mobile keeps accountant export controls inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000/reports/accountant-exports");
  await expect(page.getByRole("heading", { name: "Xuất dữ liệu kế toán" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Bộ lọc" }).click();
  await expect(page.locator('[data-slot="popover-content"]')).toBeVisible();
});
