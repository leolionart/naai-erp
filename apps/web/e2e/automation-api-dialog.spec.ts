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
  ["/expenses", '"type": "purchase_invoice"'],
] as const;

for (const [route, expected] of contexts) {
  test(`@desktop ${route} exposes only its contextual automation examples`, async ({ page }) => {
    const tokenRequests = { count: 0 };
    await install(page, tokenRequests);
    await page.goto(route);
    await page.getByRole("button", { name: "API & tự động hóa" }).click();
    const dialog = page.getByRole("dialog", { name: "Ví dụ cURL cho n8n và AI" });
    await expect(dialog).toBeVisible();
    expect(tokenRequests.count).toBe(0);
    await page.getByRole("button", { name: "Hiện ví dụ có token production" }).click();
    await expect(page.getByText(/Token production đã được ghép/)).toBeVisible();
    expect(tokenRequests.count).toBe(1);
    await dialog.locator("button[aria-expanded]").first().click();
    await expect(dialog.locator("pre code").first()).toContainText(expected);
  });
}

test("@mobile expense dialog remains responsive with a complete invoice example", async ({
  page,
}) => {
  const tokenRequests = { count: 0 };
  await install(page, tokenRequests);
  await page.goto("/expenses");
  await page.getByRole("button", { name: "API & tự động hóa" }).click();
  await expect(page.getByRole("dialog", { name: "Ví dụ cURL cho n8n và AI" })).toBeVisible();
  await page.getByRole("button", { name: "Hiện ví dụ có token production" }).click();
  await expect(page.getByText(/Token production đã được ghép/)).toBeVisible();
  await page.getByRole("button", { name: /Nhập hóa đơn OCR tối giản/ }).click();
  const code = page.locator("pre code").first();
  await expect(code).toContainText("Authorization: Bearer e2e-stable-token");
  await expect(code).toContainText('"type": "purchase_invoice"');
  await expect(code).toContainText('"externalReference"');
  await expect(code).toContainText('"normalized_tax_id"');
  await expect(code).not.toContainText('"projectId"');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth + 1),
  );
});
