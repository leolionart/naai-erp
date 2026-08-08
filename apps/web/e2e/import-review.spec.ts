import { expect, test } from "@playwright/test";

test("@desktop replaces the legacy import-review queue with the controlled ERP package workflow", async ({
  page,
}) => {
  await page.goto("http://localhost:3000/settings/data-package");

  await expect(
    page.getByRole("heading", { name: "Sao lưu & chỉnh sửa toàn bộ dữ liệu ERP" }),
  ).toBeVisible();
  await expect(
    page.getByText("Đây là Full ERP Data Package, không phải Accountant Export"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Kiểm kê file" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dry-run" })).toBeVisible();
  await expect(
    page.locator('[data-slot="sidebar-content"]').getByRole("link", {
      name: "Sao lưu & nhập lại ERP",
    }),
  ).toHaveAttribute("href", "/settings/data-package");
  await expect(
    page.locator('[data-slot="sidebar-content"]').getByRole("link", {
      name: "Dữ liệu cần bổ sung",
    }),
  ).toHaveCount(0);
});

test("@desktop legacy import-review URL is no longer an application workflow", async ({ page }) => {
  const response = await page.goto("http://localhost:3000/imports/review");
  expect(response?.status()).toBe(404);
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("@mobile keeps the replacement data-package workflow within the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000/settings/data-package");
  await expect(page.getByText("Full ERP Data Package", { exact: false }).first()).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
