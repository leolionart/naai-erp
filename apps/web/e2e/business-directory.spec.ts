import { expect, test, type Page } from "@playwright/test";

const envelope = (data: unknown) => ({
  apiVersion: "v1",
  requestId: "business-directory-e2e",
  organizationId: "naai",
  data,
});

async function authenticate(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("naai-erp-admin-token", "directory-token"));
}

test("@desktop customer profile embeds revenue activity and links accounts receivable", async ({
  page,
}) => {
  await authenticate(page);
  await page.route("**/api/v1/organizations/naai/master-data/parties/*", async (route) => {
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
  await expect(
    page.getByText("2. Hóa đơn Khách hàng (Đầu ra & Đã liên kết)", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Hóa đơn đầu ra · Công nợ phải thu")).toBeVisible();
  await expect(page.getByRole("link", { name: "Xem sổ chi tiết công nợ" })).toHaveAttribute(
    "href",
    "/receivables/customers/client-a",
  );

  await page.getByRole("button", { name: "Chỉnh sửa thông tin" }).click();
  await expect(page.getByRole("dialog", { name: "Chỉnh sửa khách hàng" })).toBeVisible();
  await expect(page.getByLabel("Tên khách hàng")).toHaveValue("Công ty Khách hàng A");
});

test("@desktop project profile embeds invoice, budget and cost workspaces", async ({ page }) => {
  await authenticate(page);
  await page.route("**/api/v1/organizations/naai/master-data/projects/*", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        envelope({
          id: "website-a",
          code: "WEB-A",
          name: "Website khách hàng A",
          client_party_id: "client-a",
          owner_user_id: "owner-a",
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
  await expect(page.getByText("client-a", { exact: true })).toBeVisible();
  await expect(
    page.getByText("1. Hóa đơn Dự án (Bán ra & Mua vào)", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("2. Ngân sách & Ghi nhận Doanh thu", { exact: true })).toBeVisible();
  await expect(page.getByText("3. Chi phí Dự án (Project Costs)", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Chỉnh sửa thông tin" }).click();
  const editor = page.getByRole("dialog", { name: "Chỉnh sửa dự án" });
  await expect(editor.getByLabel("ID khách hàng")).toHaveValue("client-a");
  await expect(editor.getByLabel("ID người phụ trách")).toHaveValue("owner-a");
});

test("@desktop unreferenced operational project can be deleted with an audited reason", async ({
  page,
}) => {
  await authenticate(page);
  let deleted = false;
  await page.route("**/api/v1/organizations/naai/master-data/projects/*", async (route) => {
    if (route.request().method() === "DELETE") {
      expect(route.request().headers()["if-match"]).toBe("3");
      expect(route.request().postDataJSON()).toEqual({ reason: "Bản ghi nhập trùng" });
      deleted = true;
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(envelope({ deleted: true, id: "duplicate-project" })),
      });
    }
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        envelope({
          id: "duplicate-project",
          code: "DUPLICATE",
          name: "Dự án nhập trùng",
          client_party_id: "client-a",
          owner_user_id: "owner-a",
          contract_type: "fixed_fee",
          currency: "VND",
          budget_minor: "0",
          starts_on: "2026-08-01",
          ends_on: null,
          state: "closed",
          resource_version: "3",
        }),
      ),
    });
  });
  await page.route("**/api/v1/organizations/naai/master-data/projects?limit=100", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(envelope({ items: [] })),
    }),
  );

  await page.goto("http://localhost:3000/projects/duplicate-project");
  await page.getByRole("button", { name: "Xóa dự án" }).click();
  const confirmation = page.getByRole("alertdialog", { name: "Xóa dự án vận hành?" });
  await confirmation.getByLabel("Lý do xóa").fill("Bản ghi nhập trùng");
  await confirmation.getByRole("button", { name: "Xóa dự án" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  expect(deleted).toBe(true);
});

test("@desktop directory create action opens an in-context dialog", async ({ page }) => {
  await authenticate(page);
  await page.route("**/api/v1/organizations/naai/master-data/parties?limit=100", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(envelope({ items: [] })),
    }),
  );
  await page.route("**/api/v1/organizations/naai/master-data/projects?limit=100", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(envelope({ items: [] })),
    }),
  );
  await page.route("**/api/v1/organizations/naai/master-data/party-roles?limit=100", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(envelope({ items: [] })),
    }),
  );

  await page.goto("http://localhost:3000/customers");
  await page.getByRole("button", { name: "Tạo mới" }).click();
  await expect(page.getByRole("dialog", { name: "Tạo khách hàng" })).toBeVisible();
  await expect(page.getByLabel("ID", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Tên khách hàng")).toBeVisible();
});

test("@desktop project directory filters by state and overlapping execution dates", async ({
  page,
}) => {
  await authenticate(page);
  await page.route("**/api/v1/organizations/naai/master-data/projects?limit=100", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        envelope({
          items: [
            {
              id: "ylvn-may",
              code: "YLVN-2025-05",
              name: "Yêu Lắm VN — 05/2025",
              state: "active",
              starts_on: "2025-05-01",
              ends_on: "2025-05-31",
            },
            {
              id: "ylvn-may-duplicate",
              code: "YLVN-2025-05-DUP",
              name: "Yêu Lắm VN — 05/2025 — bản nhập trùng",
              state: "closed",
              starts_on: "2025-05-01",
              ends_on: "2025-05-31",
            },
            {
              id: "website-august",
              code: "WEB-2025-08",
              name: "Website tháng 08/2025",
              state: "active",
              starts_on: "2025-08-01",
              ends_on: "2025-08-31",
            },
          ],
        }),
      ),
    }),
  );

  await page.goto(
    "http://localhost:3000/projects?state=closed&startsOn=2025-05-15&endsOn=2025-05-20",
  );
  await expect(page.getByText("Yêu Lắm VN", { exact: true })).toBeVisible();
  await expect(page.getByText("05/2025 — bản nhập trùng", { exact: true })).toBeVisible();
  await expect(page.getByText("Website tháng 08/2025", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Bộ lọc" }).click();
  await expect(page.getByLabel("Từ ngày")).toHaveValue("2025-05-15");
  await expect(page.getByLabel("Đến ngày")).toHaveValue("2025-05-20");
  await expect(page.getByLabel("Trạng thái dự án")).toContainText("Đã đóng");
});
