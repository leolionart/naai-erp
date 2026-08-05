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
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: "Tổng quan vận hành" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Module đang hoạt động" })).toBeVisible();
}

async function expectDocumentCreateForm(page: Page) {
  await expect(page).toHaveURL(/\/documents$/);
  await expect(page.getByRole("heading", { level: 1, name: "Hóa đơn" })).toBeVisible();
  await page.getByRole("button", { name: "+ Tạo mới", exact: true }).click();
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
  await page.getByRole("link", { name: "Hóa đơn", exact: true }).click();
  await expectDocumentCreateForm(page);
  assertNoBrowserErrors();
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
