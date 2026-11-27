import { expect, test, type Page } from "@playwright/test";

async function install(page: Page, tokenRequests: { count: number }) {
  await page.route("**/auth/automation-token", (route) => {
    tokenRequests.count += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Cache-Control": "no-store, private" },
      body: JSON.stringify({ organizationId: "naai", apiToken: "e2e-stable-token" }),
    });
  });
  await page.route("**/dev-api/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { items: [] } }),
    }),
  );
}

// The dialog shows the title, route, fields and sample response of each example; the cURL itself is copied.
const contexts = [
  ["/customers", "Tạo khách hàng và gán vai trò client"],
  ["/projects", "Tạo dự án liên kết khách hàng"],
  ["/subscriptions", "Tạo gói dịch vụ"],
  ["/settings/purchase-products", "Thêm sản phẩm mua vào"],
  ["/revenue", "Tạo doanh thu"],
  ["/expenses", "Chuẩn hóa dữ liệu OCR (n8n Expression)"],
] as const;

for (const [route, expectedTitle] of contexts) {
  test(`@desktop ${route} exposes only its contextual automation examples`, async ({ page }) => {
    const tokenRequests = { count: 0 };
    await install(page, tokenRequests);
    await page.goto(route);
    await page.getByRole("button", { name: "API & tự động hóa" }).click();
    const dialog = page.getByRole("dialog", { name: "REST API & tự động hóa" });
    await expect(dialog).toBeVisible();
    await expect.poll(() => tokenRequests.count).toBe(1);
    await expect(dialog.getByText("API key của tổ chức")).toBeVisible();
    await expect(dialog.getByLabel("Hiện API key")).toBeVisible();
    await dialog.getByLabel("Hiện API key").click();
    await expect(dialog.getByText("e2e-stable-token", { exact: true })).toBeVisible();
    await dialog.getByLabel("Ẩn API key").click();
    await expect(dialog.getByText("e2e-stable-token", { exact: true })).toHaveCount(0);
    await expect(dialog.getByText(expectedTitle, { exact: true })).toBeVisible();
    for (const [, otherTitle] of contexts) {
      if (otherTitle !== expectedTitle) {
        await expect(dialog.getByText(otherTitle, { exact: true })).toHaveCount(0);
      }
    }
    expect(tokenRequests.count).toBe(1);
    if (route === "/expenses") {
      await dialog.getByText("Xem expression").click();
      const expression = dialog.locator("pre code").first();
      await expect(expression).toContainText("$json.output");
      await expect(expression).toContainText('"supplierTaxId": taxNumber');
      await expect(expression).toContainText('"documentDate": documentDate');
      await expect(expression).toContainText('"grossMinor": totalPaymentMinor');
      await expect(expression).toContainText("(?:[ T].*)?$");
      await expect(expression).toContainText("/api/documents/");
    }
  });
}

test("@mobile revenue exposes the one-request matched input", async ({ page }) => {
  const tokenRequests = { count: 0 };
  await install(page, tokenRequests);
  await page.goto("/revenue");
  await page.getByRole("button", { name: "API & tự động hóa" }).click();
  const dialog = page.getByRole("dialog", { name: "REST API & tự động hóa" });
  await dialog.getByRole("button", { name: /Tạo doanh thu/ }).click();
  await expect(
    dialog.locator("code", { hasText: "/commercial-documents/sales-invoice-ingestion" }).first(),
  ).toBeVisible();
  await expect(dialog.getByText("customerName", { exact: true })).toBeVisible();
  await expect(dialog.getByText("customerTaxId", { exact: true })).toBeVisible();
  await expect(dialog.getByText("/master-data/parties")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth + 1),
  );
});

test("@mobile expense dialog remains responsive with one-request OCR ingestion", async ({
  page,
}) => {
  const tokenRequests = { count: 0 };
  await install(page, tokenRequests);
  await page.goto("/expenses");
  await page.getByRole("button", { name: "API & tự động hóa" }).click();
  const dialog = page.getByRole("dialog", { name: "REST API & tự động hóa" });
  await expect(dialog).toBeVisible();
  await expect.poll(() => tokenRequests.count).toBe(1);
  await dialog.getByRole("button", { name: /Tạo hóa đơn đầu vào/ }).click();
  await expect(
    dialog.locator("code", { hasText: "/commercial-documents/purchase-invoice-ingestion" }).first(),
  ).toBeVisible();
  await expect(dialog.getByText("supplierName hoặc supplierTaxId", { exact: true })).toBeVisible();
  await expect(dialog.getByText("externalReference", { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText("/master-data/parties")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth + 1),
  );
});
