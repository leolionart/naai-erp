import { expect, test } from "@playwright/test";

test("@desktop login block receives a cookie session and supports dark mode", async ({ page }) => {
  await page.route("**/auth/session", async (route) => {
    const request = route.request();
    expect(request.method()).toBe("POST");
    expect(request.postDataJSON()).toEqual({
      username: "owner",
      password: "e2e-password",
      remember: true,
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "set-cookie": "__Host-naai_erp_session=encrypted; Path=/; HttpOnly; Secure; SameSite=Lax",
      },
      body: JSON.stringify({ organizationId: "naai" }),
    });
  });
  await page.goto("http://localhost:3000/login");
  await expect(page.getByText("Đăng nhập NAAI ERP", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Tài khoản")).toBeVisible();
  await expect(page.getByRole("button", { name: "Đăng nhập với Google" })).toBeDisabled();
  await expect(page.getByText("Sắp ra mắt", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Đổi giao diện sáng tối" }).click();
  await page.getByRole("menuitem", { name: "Tối" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.getByLabel("Tài khoản").fill("owner");
  await page.getByRole("textbox", { name: "Mật khẩu" }).fill("e2e-password");
  await page.getByLabel("Lưu đăng nhập").check();
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("naai-erp-remembered-username")))
    .toBe("owner");
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("naai-erp-admin-token")))
    .toBeNull();
});

test("@mobile login block stays within the viewport", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("naai-erp-remembered-username", "remembered-owner");
  });
  await page.goto("http://localhost:3000/login");
  await expect(page.getByText("Đăng nhập NAAI ERP", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Tài khoản")).toHaveValue("remembered-owner");
  await expect(page.getByLabel("Lưu đăng nhập")).toBeVisible();
  await expect(page.getByRole("button", { name: "Đăng nhập với Google" })).toBeDisabled();
  await expect(page.locator('form[autocomplete="on"]')).toHaveCount(1);
  await expect(page.locator('input[name="username"][autocomplete="username"]')).toHaveCount(1);
  await expect(page.locator('input[name="password"][autocomplete="current-password"]')).toHaveCount(
    1,
  );
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});
