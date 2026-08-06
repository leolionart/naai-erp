import { expect, test } from "@playwright/test";

test("@desktop browses accountant exports and distinguishes review_required from final", async ({
  page,
}) => {
  await page.goto("http://localhost:3000/reports/accountant-exports");
  await expect(page.getByRole("heading", { name: "Xuất dữ liệu kế toán" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Xuất dữ liệu kế toán", exact: true }),
  ).toHaveAttribute("href", "/reports/accountant-exports");
  await expect(page.getByText("Dữ liệu preview được gắn nhãn")).toBeVisible();
  await expect(page.getByText("Cần rà soát · chưa phải bản cuối")).toBeVisible();

  await page.getByRole("button", { name: "Bộ lọc" }).click();
  const filters = page.getByRole("dialog", { name: "Lọc gói xuất" });
  await expect(filters.getByText("Thu hẹp danh sách theo định dạng bàn giao.")).toBeVisible();
  await filters.getByRole("button", { name: "Áp dụng" }).click();

  await page.getByRole("link", { name: "Mở chi tiết" }).click();
  await expect(page.getByRole("heading", { name: "Chi tiết gói xuất" })).toBeVisible();
  await expect(page.getByText("Gói rà soát — không phải bản cuối")).toBeVisible();
  await page.getByRole("button", { name: "Nguồn dữ liệu" }).click();
  await expect(page.getByRole("dialog", { name: "Nguồn và readiness" })).toBeVisible();
});

test("@desktop creates an XLSX export through a dedicated page and confirmation modal", async ({
  page,
}) => {
  await page.goto("http://localhost:3000/reports/accountant-exports/new");
  await expect(page.getByRole("heading", { name: "Tạo gói xuất kế toán" })).toBeVisible();
  await expect(page.getByText("Snapshot chưa final")).toBeVisible();
  await page.getByRole("button", { name: "Kiểm tra và tạo" }).click();
  const confirmation = page.getByRole("dialog", { name: "Xác nhận tạo gói XLSX" });
  await expect(confirmation.getByText("Cần rà soát · chưa phải bản cuối")).toBeVisible();
  await confirmation.getByRole("button", { name: "Tạo gói xuất" }).click();
  await expect(page).toHaveURL(/\/reports\/accountant-exports\/export-demo-2026-07/);
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
  await expect(page.getByRole("dialog", { name: "Lọc gói xuất" })).toBeVisible();
});
