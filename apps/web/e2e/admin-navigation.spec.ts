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
  await expect(page).toHaveURL(/\/documents$/);
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

async function expectBankingAccountForm(page: Page) {
  await expect(page).toHaveURL(/\/banking$/);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Ngân hàng & tiền mặt" })).toBeVisible();
  await page.getByRole("button", { name: "Thêm tài khoản" }).click();
  await expect(page.getByRole("dialog", { name: "Thêm tài khoản tiền" })).toBeVisible();
  await expect(page.getByLabel("Tên tài khoản")).toBeVisible();
  await expect(page.getByLabel("ID tài khoản sổ cái")).toBeVisible();
}

test("@desktop dashboard navigates to documents and opens the create form", async ({ page }) => {
  const assertNoBrowserErrors = failOnBrowserErrors(page);
  await expectDashboard(page);
  await page.getByRole("link", { name: "Hóa đơn", exact: true }).click();
  await expectDocumentCreateForm(page);
  assertNoBrowserErrors();
});

test("@desktop banking route opens the account creation workflow", async ({ page }) => {
  const assertNoBrowserErrors = failOnBrowserErrors(page);
  await expectDashboard(page);
  await page.getByRole("link", { name: "Ngân hàng & tiền mặt", exact: true }).click();
  await expectBankingAccountForm(page);
  assertNoBrowserErrors();
});

test("@desktop primary navigation exposes customers and projects", async ({ page }) => {
  await expectDashboard(page);
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
  await page.getByRole("dialog").getByRole("link", { name: "Hóa đơn", exact: true }).click();
  await expect(page).toHaveURL(/\/documents$/);
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expectDocumentCreateForm(page);
  assertNoBrowserErrors();
});

test("@mobile Sheet navigation reaches banking and opens the account workflow", async ({
  page,
}) => {
  const assertNoBrowserErrors = failOnBrowserErrors(page);
  await expectDashboard(page);
  await page.getByRole("button", { name: "Mở menu chính" }).click();
  const navigation = page.getByRole("dialog", { name: "Điều hướng NAAI ERP" });
  await navigation.getByRole("link", { name: "Ngân hàng & tiền mặt", exact: true }).click();
  await expect(page).toHaveURL(/\/banking$/);
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  const accountSectionTitle = page.getByText("Tài khoản ngân hàng và tiền mặt", { exact: true });
  const refreshButton = page.getByRole("button", { name: "Tải dữ liệu" });
  await expect(accountSectionTitle).toBeVisible();
  await expect(refreshButton).toBeVisible();
  const titleBox = await accountSectionTitle.boundingBox();
  const buttonBox = await refreshButton.boundingBox();
  expect(titleBox?.width).toBeGreaterThan(240);
  expect(buttonBox?.y).toBeGreaterThan((titleBox?.y ?? 0) + (titleBox?.height ?? 0));
  await expectBankingAccountForm(page);
  assertNoBrowserErrors();
});

test("@mobile Sheet navigation exposes customer and project modules", async ({ page }) => {
  await expectDashboard(page);
  await page.getByRole("button", { name: "Mở menu chính" }).click();
  const navigation = page.getByRole("dialog", { name: "Điều hướng NAAI ERP" });
  await navigation.getByRole("link", { name: "Khách hàng", exact: true }).click();
  await expect(page).toHaveURL(/\/customers$/);
  await navigation.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Khách hàng" })).toBeVisible();
});
