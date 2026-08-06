import { expect, test, type Page } from "@playwright/test";

function failOnBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return () =>
    expect(errors, "The page should not emit console or uncaught browser errors").toEqual([]);
}

async function expectDashboard(page: Page) {
  // The long-running local preview is bound to 0.0.0.0 and Next dev accepts
  // localhost as its browser origin. Keep this explicit so local E2E can reuse
  // that server without 403-ing client chunks requested through 127.0.0.1.
  await page.goto("http://localhost:3000/dashboard");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: "Tổng quan điều hành" })).toBeVisible();
  await expect(page.getByText("Xu hướng doanh thu", { exact: true })).toBeVisible();
}

async function expectDocumentCreateForm(page: Page) {
  await expect(page).toHaveURL(/\/documents(?:\?.*)?$/);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Hóa đơn" })).toBeVisible();
  await page.getByRole("link", { name: "Tạo mới", exact: true }).click();
  await expect(page).toHaveURL(/\/documents\/new$/);
  await expect(
    page.getByText("Số hóa đơn", { exact: true }).locator("..").locator("input"),
  ).toBeVisible();
  await expect(
    page.getByText("Mã khách hàng / nhà cung cấp", { exact: true }).locator("..").locator("input"),
  ).toBeVisible();
}

test("@desktop dashboard navigates to documents and opens the create form", async ({ page }) => {
  const assertNoBrowserErrors = failOnBrowserErrors(page);
  await expectDashboard(page);
  await page.getByRole("button", { name: "Hóa đơn", exact: true }).click();
  await page.getByRole("link", { name: "Đầu ra", exact: true }).click();
  await expectDocumentCreateForm(page);
  assertNoBrowserErrors();
});

test("@desktop primary navigation exposes customers and projects", async ({ page }) => {
  await expectDashboard(page);
  for (const hidden of ["Dữ liệu nền", "Sổ kế toán", "Ngân hàng & tiền mặt"]) {
    await expect(page.getByRole("link", { name: hidden, exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole("link", { name: "Chi phí không hóa đơn" })).toHaveCount(0);
  await page.getByRole("button", { name: "Báo cáo tài chính", exact: true }).click();
  await expect(page.getByRole("link", { name: "Kết quả kinh doanh" })).toBeVisible();
  await page.getByRole("button", { name: "Công nợ", exact: true }).click();
  await expect(page.getByRole("link", { name: "Phải thu", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Phải trả", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Khách hàng", exact: true }).click();
  await expect(page).toHaveURL(/\/customers$/);
  await expect(page.getByRole("heading", { level: 1, name: "Khách hàng" })).toBeVisible();
  await page.getByRole("link", { name: "Dự án", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("heading", { level: 1, name: "Dự án" })).toBeVisible();
});

test("@mobile Sheet navigation reaches documents and keeps the primary workflow usable", async ({
  page,
}) => {
  const assertNoBrowserErrors = failOnBrowserErrors(page);
  await expectDashboard(page);
  await page.getByRole("button", { name: "Mở menu chính" }).click();
  await expect(page.getByRole("dialog", { name: "Điều hướng NAAI ERP" })).toBeVisible();
  const navigation = page.getByRole("dialog", { name: "Điều hướng NAAI ERP" });
  await navigation.getByRole("button", { name: "Hóa đơn", exact: true }).click();
  await navigation.getByRole("link", { name: "Đầu vào", exact: true }).click();
  await expect(page).toHaveURL(/\/documents\?type=purchase_invoice$/);
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expectDocumentCreateForm(page);
  assertNoBrowserErrors();
});

test("@mobile Sheet navigation exposes customer and project modules", async ({ page }) => {
  await expectDashboard(page);
  await page.getByRole("button", { name: "Mở menu chính" }).click();
  const navigation = page.getByRole("dialog", { name: "Điều hướng NAAI ERP" });
  for (const hidden of ["Dữ liệu nền", "Sổ kế toán", "Ngân hàng & tiền mặt"]) {
    await expect(navigation.getByRole("link", { name: hidden, exact: true })).toHaveCount(0);
  }
  await expect(navigation.getByRole("link", { name: "Chi phí không hóa đơn" })).toHaveCount(0);
  await navigation.getByRole("button", { name: "Báo cáo tài chính", exact: true }).click();
  await expect(navigation.getByRole("link", { name: "Bảng cân đối kế toán" })).toBeVisible();
  await navigation.getByRole("button", { name: "Công nợ", exact: true }).click();
  await expect(navigation.getByRole("link", { name: "Phải thu", exact: true })).toBeVisible();
  await navigation.getByRole("link", { name: "Khách hàng", exact: true }).click();
  await expect(page).toHaveURL(/\/customers$/);
  await navigation.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Khách hàng" })).toBeVisible();
});
