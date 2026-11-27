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

test("@desktop /settings/automation exposes REST API & automation dialog and keeps operational headers clean", async ({
  page,
}) => {
  const tokenRequests = { count: 0 };
  await install(page, tokenRequests);

  for (const route of ["/expenses", "/revenue", "/customers", "/projects"]) {
    await page.goto(route);
    await expect(page.getByRole("button", { name: "API & tự động hóa" })).toHaveCount(0);
  }

  await page.goto("/settings/automation");
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
  await expect(
    dialog.getByText("Tạo khách hàng và gán vai trò client", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Chuẩn hóa dữ liệu OCR (n8n Expression)", { exact: true }),
  ).toBeVisible();
  await dialog.getByText("Xem expression").click();
  const expression = dialog.locator("pre code").first();
  await expect(expression).toContainText("$json.output");
  await expect(expression).toContainText('"supplierTaxId": taxNumber');
  await expect(expression).toContainText('"documentDate": documentDate');
  await expect(expression).toContainText('"grossMinor": totalPaymentMinor');
  expect(tokenRequests.count).toBe(1);
});

test("@mobile /settings/automation dialog remains responsive with one-request ingestion", async ({
  page,
}) => {
  const tokenRequests = { count: 0 };
  await install(page, tokenRequests);
  await page.goto("/settings/automation");
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
