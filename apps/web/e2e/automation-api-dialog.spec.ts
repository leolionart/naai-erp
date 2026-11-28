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
      body: JSON.stringify({
        data: { operatingMode: "solopreneur", webhookSources: [], apiCredentials: [] },
      }),
    }),
  );
}

test("@desktop /settings/automation renders inline REST API & automation reference without header popup buttons", async ({
  page,
}) => {
  const tokenRequests = { count: 0 };
  await install(page, tokenRequests);

  for (const route of ["/expenses", "/revenue", "/customers", "/projects"]) {
    await page.goto(route);
    await expect(page.getByRole("button", { name: "API & tự động hóa" })).toHaveCount(0);
  }

  await page.goto("/settings/automation");
  await expect(page.getByRole("button", { name: "API & tự động hóa" })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Kết nối REST API & Tài liệu tự động hóa", { exact: true }),
  ).toBeVisible();
  await expect.poll(() => tokenRequests.count).toBe(1);

  const apiKeyBox = page.getByRole("region", { name: "API key" });
  await expect(apiKeyBox.getByText("API key của tổ chức")).toBeVisible();
  await expect(apiKeyBox.getByText("Org: naai")).toBeVisible();
  await expect(apiKeyBox.getByText("e2e-stable-token", { exact: true })).toHaveCount(0);

  await apiKeyBox.getByLabel("Hiện API key").click();
  await expect(apiKeyBox.getByText("e2e-stable-token", { exact: true })).toBeVisible();
  await apiKeyBox.getByLabel("Ẩn API key").click();
  await expect(apiKeyBox.getByText("e2e-stable-token", { exact: true })).toHaveCount(0);

  await expect(
    page.getByText("Tạo khách hàng và gán vai trò client", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Chuẩn hóa dữ liệu OCR (n8n Expression)", { exact: true }),
  ).toBeVisible();

  const filterGroup = page.getByRole("group", { name: "Bộ lọc phân hệ API" });
  await filterGroup.getByRole("button", { name: "Khách hàng", exact: true }).click();
  await expect(
    page.getByText("Tạo khách hàng và gán vai trò client", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Chuẩn hóa dữ liệu OCR (n8n Expression)", { exact: true }),
  ).toHaveCount(0);

  await filterGroup.getByRole("button", { name: "Chi phí & Hóa đơn mua", exact: true }).click();
  await expect(
    page.getByText("Chuẩn hóa dữ liệu OCR (n8n Expression)", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Xem expression" }).click();
  const expression = page.locator("pre code").first();
  await expect(expression).toContainText("$json.output");
  await expect(expression).toContainText('"supplierTaxId": taxNumber');
  await expect(expression).toContainText('"documentDate": documentDate');
  await expect(expression).toContainText('"grossMinor": totalPaymentMinor');
  expect(tokenRequests.count).toBe(1);
});

test("@mobile /settings/automation inline API reference remains responsive with one-request ingestion", async ({
  page,
}) => {
  const tokenRequests = { count: 0 };
  await install(page, tokenRequests);
  await page.goto("/settings/automation");
  await expect(page.getByRole("button", { name: "API & tự động hóa" })).toHaveCount(0);
  await expect.poll(() => tokenRequests.count).toBe(1);

  await page.getByRole("button", { name: /Tạo hóa đơn đầu vào/ }).click();
  await expect(
    page.locator("code", { hasText: "/commercial-documents/purchase-invoice-ingestion" }).first(),
  ).toBeVisible();
  await expect(page.getByText("supplierName hoặc supplierTaxId", { exact: true })).toBeVisible();
  await expect(page.getByText("externalReference", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("/master-data/parties")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth + 1),
  );
});
