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

const contexts = [
  ["/customers", "/master-data/parties"],
  ["/projects", "/master-data/projects"],
  ["/subscriptions", "/service-plans"],
  ["/settings/purchase-products", "/master-data/purchase-products"],
  ["/documents", '"type": "sales_invoice"'],
  ["/expenses", "$json.output"],
] as const;

for (const [route, expected] of contexts) {
  test(`@desktop ${route} exposes only its contextual automation examples`, async ({ page }) => {
    const tokenRequests = { count: 0 };
    await install(page, tokenRequests);
    await page.goto(route);
    await page.getByRole("button", { name: "API & tự động hóa" }).click();
    const dialog = page.getByRole("dialog", { name: "Ví dụ cURL cho n8n và AI" });
    await expect(dialog).toBeVisible();
    await expect.poll(() => tokenRequests.count).toBe(1);
    await expect(dialog.getByText("API key của tổ chức")).toBeVisible();
    await expect(dialog.getByLabel("Hiện API key")).toBeVisible();
    await dialog.getByLabel("Hiện API key").click();
    await expect(dialog.getByText("e2e-stable-token", { exact: true })).toBeVisible();
    await dialog.getByLabel("Ẩn API key").click();
    await expect(dialog.getByText("e2e-stable-token", { exact: true })).toHaveCount(0);
    await expect(dialog.locator("button[aria-expanded]").first()).toBeVisible();
    expect(tokenRequests.count).toBe(1);
    await dialog.locator("button[aria-expanded]").first().click();
    await expect(dialog.locator("pre code").first()).toContainText(expected);
    if (route === "/expenses") {
      const expression = dialog.locator("pre code").first();
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
  await page.goto("/documents");
  await page.getByRole("button", { name: "API & tự động hóa" }).click();
  const dialog = page.getByRole("dialog", { name: "Ví dụ cURL cho n8n và AI" });
  await dialog.getByRole("button", { name: /Nhập nhanh doanh thu bằng một request/ }).click();
  const code = dialog.locator("pre code").filter({ hasText: "sales-invoice-ingestion" });
  await expect(code).toContainText('"customerTaxId": "0312345678"');
  await expect(code).toContainText('"grossMinor": "11000000"');
  await expect(code).not.toContainText("/master-data/parties");
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
  await expect(page.getByRole("dialog", { name: "Ví dụ cURL cho n8n và AI" })).toBeVisible();
  await expect.poll(() => tokenRequests.count).toBe(1);
  await page.getByRole("button", { name: /Nhập nhanh hóa đơn OCR bằng một request/ }).click();
  const code = page.locator("pre code").filter({ hasText: "Authorization: Bearer" }).first();
  await expect(code).toContainText("Authorization: Bearer e2e-stable-token");
  await expect(code).toContainText("/commercial-documents/purchase-invoice-ingestion");
  await expect(code).toContainText('"supplierTaxId": "0110660175"');
  await expect(code).toContainText('"category": "Thuê pin và sạc xe điện"');
  await expect(code).toContainText('"grossMinor": "408601"');
  await expect(code).toContainText('"externalReference"');
  await expect(code).not.toContainText('"projectId"');
  await expect(code).not.toContainText('"fundingSource"');
  await expect(code).not.toContainText("/master-data/parties");
  await page.getByRole("button", { name: "Xóa hóa đơn nháp tạo dư" }).click();
  const discardCode = page.locator("pre code").filter({ hasText: "curl --request DELETE" });
  await expect(discardCode).toContainText('{{$json["data"]["document"]["documentId"]}}');
  await expect(discardCode).toContainText(
    'If-Match: {{$json["data"]["document"]["resourceVersion"]}}',
  );
  await expect(discardCode).toContainText("Idempotency-Key: discard-paperless-invoice-246-v1");
  await expect(discardCode).toContainText('"reason": "Xóa hóa đơn nháp tạo dư');
  await expect(
    page.getByText(/Chỉ dùng cho hóa đơn còn ở trạng thái draft và chưa có bút toán/),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth + 1),
  );
});
