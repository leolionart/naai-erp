import { expect, test } from "@playwright/test";

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

test("@desktop persists executive filters in the URL and opens source Drawer", async ({ page }) => {
  await page.goto("http://localhost:3000/reports/executive-metrics/equity");
  await expect(page.getByText("42,00%").first()).toBeVisible();
  await page.getByRole("button", { name: "Bộ lọc" }).click();
  const sheet = page.locator('[data-slot="popover-content"]');
  await sheet.getByLabel("Service line").fill("web-app");
  await sheet.getByRole("button", { name: "Áp dụng" }).click();
  await expect(page).toHaveURL(/serviceLineCode=web-app/);
  await expect(page.getByText("Service line: web-app")).toBeVisible();

  await page.getByRole("button", { name: "Xem nguồn" }).first().click();
  const drawer = page.getByRole("dialog", { name: /Nguồn chỉ số/ });
  await expect(drawer.getByText("Bảng cân đối · 421")).toBeVisible();
  await expect(drawer.getByText(/fingerprint demo-erp640/)).toBeVisible();
});

test("@desktop keeps project and marketing ROI purpose-specific", async ({ page }) => {
  await page.goto("http://localhost:3000/reports/executive-metrics/roi");
  await expect(page.getByText("ROI dự án Web App A").first()).toBeVisible();
  await expect(page.getByText("ROI chiến dịch Q3").first()).toBeVisible();
  await page.getByRole("button", { name: "Xem nguồn" }).first().click();
  await expect(page.getByText("ROI definition PROJECT-01")).toBeVisible();
  await page.getByRole("button", { name: "Đóng" }).click();
  await page.getByRole("button", { name: "Xem nguồn" }).nth(1).click();
  await expect(page.getByText("ROI definition MKT-02")).toBeVisible();
});

test("@mobile executive metrics keep filters and exact table within the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000/reports/executive-metrics/liquidity");
  await expect(page.getByText("4,00 tháng").first()).toBeVisible();
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
