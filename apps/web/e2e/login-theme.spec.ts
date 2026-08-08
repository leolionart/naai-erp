import { expect, test } from "@playwright/test";

test("@desktop login block stores the API session and supports dark mode", async ({ page }) => {
  await page.route("**/auth/session", async (route) => {
    const request = route.request();
    expect(request.method()).toBe("POST");
    expect(request.postDataJSON()).toEqual({ username: "owner", password: "e2e-password" });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ organizationId: "naai", apiToken: "e2e-session-token" }),
    });
  });
  await page.goto("http://localhost:3000/login");
  await expect(page.getByText("Đăng nhập NAAI ERP", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Tài khoản")).toBeVisible();

  await page.getByRole("button", { name: "Đổi giao diện sáng tối" }).click();
  await page.getByRole("menuitem", { name: "Tối" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.getByLabel("Tài khoản").fill("owner");
  await page.getByLabel("Mật khẩu").fill("e2e-password");
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
