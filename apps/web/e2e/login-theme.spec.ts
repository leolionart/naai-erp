import { expect, test } from "@playwright/test";

test("@desktop login block stores the API session and supports dark mode", async ({ page }) => {
  await page.goto("http://localhost:3000/login");
  await expect(page.getByText("Đăng nhập NAAI ERP", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Organization ID")).toHaveValue("naai");

  await page.getByRole("button", { name: "Đổi giao diện sáng tối" }).click();
  await page.getByRole("menuitem", { name: "Tối" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.getByLabel("Access token").fill("e2e-session-token");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("naai-erp-admin-token")))
    .toBe("e2e-session-token");
});

test("@mobile login block stays within the viewport", async ({ page }) => {
  await page.goto("http://localhost:3000/login");
  await expect(page.getByText("Đăng nhập NAAI ERP", { exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});
