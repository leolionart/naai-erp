import { expect, test, type Page } from "@playwright/test";

const envelope = (data: unknown) => ({
  apiVersion: "v1",
  requestId: "business-directory-e2e",
  organizationId: "org-demo",
  data,
});

async function authenticate(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("naai-erp-admin-token", "directory-token"));
}

test("@desktop customer profile links sales invoices and accounts receivable", async ({ page }) => {
  await authenticate(page);
  await page.route("**/api/v1/organizations/org-demo/master-data/parties/*", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        envelope({
          id: "client-a",
          display_name: "Công ty Khách hàng A",
          normalized_tax_id: "0312345678",
          status: "active",
        }),
      ),
    });
  });

  await page.goto("http://localhost:3000/customers/client-a");
  await expect(page.getByRole("heading", { level: 1, name: "Hồ sơ khách hàng" })).toBeVisible();
  await expect(page.getByText("Công ty Khách hàng A", { exact: true })).toBeVisible();
  await expect(page.getByText("0312345678", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Hóa đơn khách hàng" })).toHaveAttribute(
    "href",
    "/documents?partyId=client-a",
  );
  await expect(page.getByRole("link", { name: "Xem công nợ phải thu" })).toHaveAttribute(
    "href",
    "/receivables/customers/client-a",
  );

  await page.getByRole("button", { name: "Chỉnh sửa" }).click();
  await expect(page.getByRole("dialog", { name: "Chỉnh sửa khách hàng" })).toBeVisible();
  await expect(page.getByLabel("Tên khách hàng")).toHaveValue("Công ty Khách hàng A");
});

test("@desktop project profile exposes customer, invoice and financial drilldowns", async ({
  page,
}) => {
  await authenticate(page);
  await page.route("**/api/v1/organizations/org-demo/master-data/projects/*", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        envelope({
          id: "website-a",
          code: "WEB-A",
          name: "Website khách hàng A",
          client_party_id: "client-a",
          contract_type: "fixed_fee",
          currency: "VND",
          budget_minor: "250000000",
          starts_on: "2026-08-01",
          ends_on: "2026-10-31",
          state: "active",
        }),
      ),
    });
  });

  await page.goto("http://localhost:3000/projects/website-a");
  await expect(page.getByText("Website khách hàng A", { exact: true })).toBeVisible();
  await expect(page.getByText("250.000.000 ₫", { exact: true })).toBeVisible();
  await expect(
    page.locator("#main-content").getByRole("link", { name: "Khách hàng" }),
  ).toHaveAttribute("href", "/customers/client-a");
  await expect(page.getByRole("link", { name: "Hóa đơn dự án" })).toHaveAttribute(
    "href",
    "/documents?projectId=website-a",
  );
  await expect(page.getByRole("link", { name: "Ngân sách" })).toHaveAttribute(
    "href",
    "/projects/website-a/budget",
  );
  await expect(page.getByRole("link", { name: "Chi phí dự án" })).toHaveAttribute(
    "href",
    "/projects/website-a/costs",
  );
  await expect(page.getByRole("link", { name: "Lợi nhuận" })).toHaveAttribute(
    "href",
    "/reports/project-profitability/projects/website-a",
  );
});

test("@desktop directory create action opens an in-context drawer", async ({ page }) => {
  await authenticate(page);
  await page.route("**/api/v1/organizations/org-demo/master-data/parties?limit=100", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(envelope({ items: [] })),
    }),
  );
  await page.route("**/api/v1/organizations/org-demo/master-data/projects?limit=100", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(envelope({ items: [] })),
    }),
  );
  await page.route("**/api/v1/organizations/org-demo/master-data/party-roles?limit=100", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(envelope({ items: [] })),
    }),
  );

  await page.goto("http://localhost:3000/customers");
  await page.getByRole("button", { name: "Tạo mới" }).click();
  await expect(page.getByRole("dialog", { name: "Tạo khách hàng" })).toBeVisible();
  await expect(page.getByLabel("ID")).toBeVisible();
  await expect(page.getByLabel("Tên khách hàng")).toBeVisible();
});
