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
  let updatedProject: Record<string, unknown> | undefined;
  await page.route("**/api/v1/organizations/naai/master-data/projects/*", async (route) => {
    if (route.request().method() === "PATCH") {
      updatedProject = route.request().postDataJSON().data;
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(envelope({ ...updatedProject, id: "website-a" })),
      });
    }
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
  await expect(editor.getByLabel("Trạng thái dự án")).toContainText("Đang triển khai");
  await expect(editor.getByLabel("Ngân sách phê duyệt")).toHaveValue("250.000.000");
  await expect(editor.getByLabel("Tình trạng / Ghi chú điều hành")).toBeVisible();

  await editor.getByLabel("Trạng thái dự án").click();
  await page.getByRole("option", { name: "Tạm dừng" }).click();
  await editor.getByLabel("Ngân sách phê duyệt").fill("36.000.000");
  await editor.getByLabel("Tình trạng / Ghi chú điều hành").fill("Chờ khách hàng duyệt nội dung.");
  await editor.getByRole("button", { name: "Lưu" }).click();

  expect(updatedProject).toMatchObject({
    state: "on_hold",
    budget_minor: "36000000",
    notes: "Chờ khách hàng duyệt nội dung.",
  });
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

test("@desktop project Kanban moves a project between lifecycle columns", async ({ page }) => {
  await authenticate(page);
  let updatedState = "";
  let rejectNextUpdate = false;
  const projects = [
    {
      id: "project-active",
      code: "ACTIVE-1",
      name: "Dự án đang làm",
      state: "active",
      starts_on: "2026-01-01",
      ends_on: "2026-08-01",
    },
    {
      id: "project-completed",
      code: "DONE-1",
      name: "Dự án đã xong",
      state: "completed",
      starts_on: "2025-01-01",
      ends_on: "2025-12-31",
    },
  ];
  await page.route("**/api/v1/organizations/naai/master-data/projects?limit=100", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(envelope({ items: projects })),
    }),
  );
  await page.route("**/api/v1/organizations/naai/master-data/projects/*", async (route) => {
    if (route.request().method() === "PATCH") {
      updatedState = route.request().postDataJSON().data.state;
      if (rejectNextUpdate) {
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: { message: "Không thể cập nhật dự án" } }),
        });
      }
      projects[0]!.state = updatedState;
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(envelope(projects[0])),
      });
    }
    return route.continue();
  });

  await page.goto("http://localhost:3000/projects?view=kanban");
  await expect(page.getByLabel("Kanban")).toHaveAttribute("data-state", "on");
  await expect(page.getByRole("heading", { name: "Đang triển khai" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hoàn thành" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: /Trạng thái/ })).toHaveCount(0);

  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await page
    .getByTestId("project-kanban-card-project-active")
    .dispatchEvent("dragstart", { dataTransfer });
  await page.getByTestId("project-kanban-column-completed").dispatchEvent("drop", { dataTransfer });

  await expect.poll(() => updatedState).toBe("completed");
  await expect(page.getByTestId("project-kanban-column-completed")).toContainText("Dự án đang làm");

  rejectNextUpdate = true;
  await page.getByLabel("Chuyển trạng thái Dự án đã xong").click();
  await page.getByRole("option", { name: "Đang triển khai" }).click();
  await expect(page.getByTestId("project-kanban-column-completed")).toContainText("Dự án đã xong");
  await expect(page.getByText("Không thể cập nhật dự án")).toBeVisible();
});
