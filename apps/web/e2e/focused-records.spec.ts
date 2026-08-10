import { expect, test, type Page, type Route } from "@playwright/test";

const env = (data: unknown) => ({
  apiVersion: "v1",
  requestId: "erp720",
  organizationId: "naai",
  data,
});
const reply = (route: Route, data: unknown) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(env(data)) });
const fail = (route: Route, status: number, code: string, message: string) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({ ...env(undefined), error: { code, message } }),
  });

const invoice = {
  id: "invoice-720",
  type: "sales_invoice",
  documentNumber: "INV-720",
  partyId: "client-720",
  documentDate: "2026-08-06",
  dueDate: "2026-08-20",
  currency: "VND",
  netMinor: "10000000",
  taxMinor: "1000000",
  grossMinor: "11000000",
  state: "draft",
  resourceVersion: "1",
  controlAccountCode: "131",
  lines: [
    {
      id: "line-1",
      description: "Thiết kế web",
      primaryAccountCode: "511",
      netMinor: "10000000",
      taxMinor: "1000000",
      grossMinor: "11000000",
      dimensions: { category: "SOFTWARE_DEV" },
      allocations: [
        {
          id: "allocation-1",
          amountMinor: "10000000",
          dimensions: {
            costCenter: "DELIVERY",
            projectId: "project-720",
            contractId: "contract-720",
          },
        },
      ],
    },
  ],
};
const purchaseInvoice = {
  ...invoice,
  id: "purchase-720",
  type: "purchase_invoice",
  documentNumber: "PINV-720",
  partyId: "supplier-720",
  controlAccountCode: "331",
  counterAccountCode: "3388-OWNER",
  lines: invoice.lines.map((line) => ({
    ...line,
    dimensions: { category: "DOMAIN_HOSTING" },
  })),
};
const recognition = {
  id: "recognition-720",
  projectId: "project-720",
  effectiveOn: "2026-08-05",
  amountMinor: "8000000",
  currency: "VND",
  state: "posted",
  reason: "Ghi nhận doanh thu thiết kế web",
  resourceVersion: "1",
};
const expense = {
  id: "expense-720",
  expenseClass: "non_documented",
  expenseDate: "2026-08-06",
  businessPurpose: "Phí vận hành",
  payeePartyId: "supplier-720",
  currency: "VND",
  netMinor: "2000000",
  vatMinor: "0",
  grossMinor: "2000000",
  category: "DOMAIN_HOSTING",
  state: "draft",
  resourceVersion: "1",
  counterAccountCode: "111",
  evidenceChecklist: { invoice: false, receipt: true, contract: false, payment: false },
  lines: [
    {
      id: "line-1",
      description: "Phí vận hành",
      postingAccountCode: "642",
      netMinor: "2000000",
      vatMinor: "0",
      grossMinor: "2000000",
      allocations: [
        {
          id: "allocation-2",
          amountMinor: "2000000",
          dimensions: {
            costCenter: "ADMIN",
            projectId: "project-720",
            contractId: "contract-720",
          },
        },
      ],
    },
  ],
};

async function install(
  page: Page,
  patchFailure?: { kind: "documents" | "expenses"; status: number; code: string; message: string },
  expenseState: "draft" | "posted" = "draft",
) {
  let currentInvoice = { ...invoice };
  let currentExpense = {
    ...expense,
    state: expenseState as string,
    payeePartyId: expense.payeePartyId as string | null,
  };
  await page.addInitScript(() => sessionStorage.setItem("naai-erp-admin-token", "erp720-token"));
  await page.route("**/api/v1/organizations/naai/master-data/expense-categories**", (route) =>
    reply(route, {
      items: [
        {
          code: "MEAL",
          name: "Chi phí ăn uống / Tiếp khách",
          isActive: true,
          fundingTreatment: "tax_only_non_cash",
        },
        {
          code: "DOMAIN_HOSTING",
          name: "Chi phí Tên miền / Hosting",
          isActive: true,
          fundingTreatment: "owner_paid_company_cost",
        },
      ],
    }),
  );
  await page.route("**/api/v1/organizations/naai/master-data/parties**", (route) =>
    reply(route, {
      items: [
        { id: "client-720", name: "Khách hàng 720" },
        { id: "supplier-720", name: "Nhà cung cấp 720" },
        { id: "supplier-721", name: "Nhà cung cấp hạ tầng 721" },
        { id: "employee-720", display_name: "Nguyễn Nhân Viên" },
      ],
    }),
  );
  await page.route("**/api/v1/organizations/naai/master-data/party-roles**", (route) =>
    reply(route, {
      items: [
        { party_id: "client-720", role: "client" },
        { party_id: "supplier-720", role: "supplier" },
        { party_id: "supplier-721", role: "supplier" },
        { party_id: "employee-720", role: "employee" },
      ],
    }),
  );
  await page.route("**/api/v1/organizations/naai/time/workers**", (route) =>
    reply(route, {
      items: [
        {
          id: "worker-720",
          worker_party_id: "employee-720",
          employmentKind: "employee",
          status: "active",
        },
      ],
    }),
  );
  await page.route("**/api/v1/organizations/naai/master-data/projects**", (route) =>
    reply(route, {
      items: [
        { id: "project-720", name: "Dự án khách hàng 720", client_party_id: "client-720" },
        { id: "project-other", name: "Dự án khách hàng khác", client_party_id: "client-other" },
      ],
    }),
  );
  await page.route("**/api/v1/organizations/naai/accounting-list-exports/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      headers: {
        "content-disposition": `attachment; filename="${route.request().url().includes("sales-invoices") ? "naai-erp-doanh-thu-2026-08-01_2026-08-31.xlsx" : "naai-erp-chi-phi-2026-08-01_2026-08-31.xlsx"}"`,
      },
      body: Buffer.from([80, 75, 3, 4]),
    }),
  );
  await page.route("**/api/v1/organizations/naai/commercial-documents**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "PATCH" && url.pathname.endsWith("/invoice-720")) {
      if (patchFailure?.kind === "documents")
        return fail(route, patchFailure.status, patchFailure.code, patchFailure.message);
      expect(route.request().headers()["if-match"]).toBe("1");
      const body = route.request().postDataJSON() as typeof invoice;
      if (body.lines[0]?.allocations?.[0]?.dimensions) {
        expect(body.lines[0].allocations[0].dimensions).toMatchObject({
          costCenter: "DELIVERY",
          projectId: "project-720",
        });
        expect(body.lines[0].allocations[0].dimensions).not.toHaveProperty("contractId");
        expect(body.lines[0].allocations[0].id).toBe("allocation-1");
        expect(body.lines[0].allocations[0].amountMinor).toBe(body.lines[0].netMinor);
        expect(body.lines[0].allocations[0].dimensions).not.toHaveProperty("project");
      }
      currentInvoice = { ...currentInvoice, ...body, resourceVersion: "2" };
      return reply(route, { documentId: currentInvoice.id, resourceVersion: "2" });
    }
    if (route.request().method() === "POST" && url.pathname.endsWith("/commercial-documents"))
      return reply(route, currentInvoice);
    if (url.pathname.endsWith("/invoice-720")) return reply(route, currentInvoice);
    const type = url.searchParams.get("type");
    return reply(route, {
      items:
        type === "purchase_invoice"
          ? [purchaseInvoice]
          : type === "sales_invoice"
            ? [currentInvoice]
            : [currentInvoice, purchaseInvoice],
    });
  });
  await page.route("**/api/v1/organizations/naai/expenses**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "PATCH" && url.pathname.endsWith("/expense-720/metadata")) {
      expect(route.request().headers()["if-match"]).toBe("1");
      const body = route.request().postDataJSON() as {
        category: string;
        payeePartyId: string | null;
        businessPurpose: string;
      };
      expect(body).toEqual({
        category: "DOMAIN_HOSTING",
        payeePartyId: "supplier-721",
        businessPurpose: "Gia hạn hạ tầng vận hành",
      });
      currentExpense = {
        ...currentExpense,
        ...body,
        resourceVersion: "2",
        lines: currentExpense.lines.map((line) => ({
          ...line,
          description: body.businessPurpose,
          dimensions: { ...line.allocations[0]?.dimensions, category: body.category },
        })),
      };
      return reply(route, {
        expenseId: currentExpense.id,
        resourceVersion: "2",
        ...body,
      });
    }
    if (route.request().method() === "PATCH" && url.pathname.endsWith("/expense-720/category")) {
      const body = route.request().postDataJSON() as { category: string };
      currentExpense = {
        ...currentExpense,
        lines: currentExpense.lines.map((line) => ({
          ...line,
          dimensions: { ...line.allocations[0]?.dimensions, category: body.category },
        })),
      };
      return reply(route, { expenseId: currentExpense.id, category: body.category });
    }
    if (route.request().method() === "PATCH" && url.pathname.endsWith("/expense-720")) {
      if (patchFailure?.kind === "expenses")
        return fail(route, patchFailure.status, patchFailure.code, patchFailure.message);
      expect(route.request().headers()["if-match"]).toBe("1");
      const body = route.request().postDataJSON() as typeof expense;
      expect(body.lines[0]?.allocations[0]?.dimensions).toMatchObject({ projectId: "project-720" });
      expect(body.lines[0]?.allocations[0]?.dimensions).toMatchObject({
        costCenter: "ADMIN",
      });
      expect(body.lines[0]?.allocations[0]?.dimensions).not.toHaveProperty("contractId");
      expect(body.lines[0]?.allocations[0]?.id).toBe("allocation-2");
      expect(body.lines[0]?.allocations[0]?.amountMinor).toBe(body.lines[0]?.netMinor);
      expect(body.lines[0]?.allocations[0]?.dimensions).not.toHaveProperty("project");
      currentExpense = { ...currentExpense, ...body, resourceVersion: "2" };
      return reply(route, { expenseId: currentExpense.id, resourceVersion: "2" });
    }
    if (route.request().method() === "POST" && url.pathname.endsWith("/expenses")) {
      const body = route.request().postDataJSON() as typeof expense;
      expect(body.lines[0]?.allocations[0]?.dimensions).toMatchObject({
        projectId: "project-720",
      });
      expect(body.lines[0]?.allocations[0]?.dimensions).not.toHaveProperty("contractId");
      return reply(route, currentExpense);
    }
    if (url.pathname.endsWith("/expense-720")) return reply(route, currentExpense);
    return reply(route, { items: [currentExpense] });
  });
  await page.route("**/api/v1/organizations/naai/revenue-recognition-events**", (route) =>
    reply(route, { items: [recognition] }),
  );
}

test("@desktop T-E2E-ERP-841-003 revenue category chart defaults management to invoiced and non-invoice activity", async ({
  page,
}) => {
  await install(page);
  await page.goto("http://localhost:3000/documents");
  await expect(page.getByRole("heading", { level: 1, name: "Quản lý doanh thu" })).toBeVisible();
  await expect(page.getByText("INV-720")).toBeVisible();
  await expect(page.getByText("Ghi nhận doanh thu thiết kế web")).toBeVisible();
  await expect(
    page.getByText("Doanh thu Phát triển phần mềm / App", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Doanh thu đã ghi nhận", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Bộ lọc" }).click();
  const filters = page.locator('[data-slot="popover-content"]');
  await filters.getByLabel("Party ID").fill("client-720");
  await filters.getByRole("button", { name: "Áp dụng" }).click();
  await expect(page).toHaveURL(/partyId=client-720/);
  await page.getByRole("button", { name: "Xem" }).first().click();
  const quickView = page.getByRole("dialog", { name: "Chi tiết & Chỉnh sửa hoạt động doanh thu" });
  await expect(quickView.getByText("11.000.000 ₫")).toBeVisible();
  await quickView.getByRole("link", { name: "Mở trang chi tiết" }).click();
  await expect(page).toHaveURL(/\/documents\/invoice-720$/);
  await expect(page.getByRole("heading", { name: "Chi tiết hóa đơn" })).toBeVisible();
  await expect(page.getByText("11.000.000 ₫").first()).toBeVisible();
  await expect(page.getByText("Chưa có external reference.")).toBeVisible();
  await page.getByRole("button", { name: "validate" }).click();
  const action = page.getByRole("dialog", { name: "Xác nhận validate" });
  await expect(action.getByRole("button", { name: "Xác nhận" })).toBeDisabled();
  await action.getByLabel("Lý do").fill("Đã kiểm tra hóa đơn");
  await action.getByRole("button", { name: "Xác nhận" }).click();
  await expect(action).not.toBeVisible();
});

test("@desktop relationship-aware revenue selects the canonical customer from the project", async ({
  page,
}) => {
  await install(page);
  await page.goto("http://localhost:3000/documents");
  await expect(page.getByRole("columnheader", { name: "Khách hàng / Nhà cung cấp" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Dự án" })).toBeVisible();
  await expect(page.getByText("Dự án khách hàng 720", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Tạo hóa đơn bán ra" }).click();
  const dialog = page.getByRole("dialog", { name: "Tạo hóa đơn" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Khách hàng 720", { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText("client-720", { exact: true })).toHaveCount(0);
  await dialog.getByLabel("Dự án").click();
  await expect(page.getByRole("option", { name: "Dự án khách hàng 720" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Dự án khách hàng khác" })).toBeVisible();
  await page.getByRole("option", { name: "Dự án khách hàng 720" }).click();
  await expect(dialog.getByLabel("Khách hàng")).toContainText("Khách hàng 720");
  await expect(dialog.getByLabel("Hợp đồng")).toHaveCount(0);
});

test("@desktop expense category chart defaults management to purchase invoices and every non-invoice expense", async ({
  page,
}) => {
  await install(page);
  await page.goto("http://localhost:3000/expenses");
  await expect(page.getByRole("heading", { level: 1, name: "Quản lý chi phí" })).toBeVisible();
  await expect(page.getByText("PINV-720")).toBeVisible();
  await expect(page.getByText("Phí vận hành")).toBeVisible();
  await expect(page.getByText("Nhà cung cấp 720", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Dự án khách hàng 720", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Chi phí Tên miền / Hosting", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText("Chủ doanh nghiệp chi hộ (TK 3388 — không trừ quỹ công ty)"),
  ).toBeVisible();
  await expect(page.getByText("Quỹ tiền mặt công ty (TK 111)")).toBeVisible();
  const filterButton = page.getByRole("button", { name: "Bộ lọc" });
  const exportButton = page.getByRole("button", { name: "Xuất danh sách XLSX" });
  const createButton = page.getByRole("button", { name: "Tạo chi phí" });
  for (const control of [filterButton, exportButton, createButton])
    await expect(control).toHaveAttribute("data-size", "sm");
  const actionHeights = await Promise.all(
    [filterButton, exportButton, createButton].map((control) =>
      control.evaluate((element) => element.getBoundingClientRect().height),
    ),
  );
  expect(new Set(actionHeights).size).toBe(1);
  await page.getByRole("button", { name: "Bộ lọc" }).click();
  const filters = page.locator('[data-slot="popover-content"]');
  await filters.getByLabel("Tình trạng hóa đơn").click();
  await page.getByRole("option", { name: "Chưa có hóa đơn" }).click();
  await filters.getByRole("button", { name: "Áp dụng" }).click();
  await expect(page).toHaveURL(/invoiceStatus=missing/);
  await expect(page.getByText("Phí vận hành")).toBeVisible();
  await page.getByRole("button", { name: "Xem" }).click();
  await expect(
    page.getByRole("dialog").getByText("Nguồn thanh toán", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .locator('[data-slot="card-title"]')
      .filter({ hasText: "Quỹ tiền mặt công ty (TK 111)" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Mở trang chi tiết" })).toHaveAttribute(
    "href",
    "/expenses/expense-720",
  );
});

test("@desktop T-E2E-ERP-877-002 posted expense metadata uses one clear save action", async ({
  page,
}) => {
  await install(page, undefined, "posted");
  await page.goto("http://localhost:3000/expenses?invoiceStatus=missing");
  await page.getByRole("button", { name: "Xem" }).click();
  const quickView = page.getByRole("dialog", { name: "Chi tiết & Chỉnh sửa hoạt động chi phí" });
  await expect(quickView.getByRole("button", { name: "Lưu danh mục" })).toHaveCount(0);
  await expect(quickView.getByRole("link", { name: "Mở trang chi tiết" })).toHaveCount(0);
  await expect(quickView.getByRole("button")).toHaveCount(2); // Save + dialog close.
  await quickView.getByLabel("Đối tác thụ hưởng").fill("hạ tầng");
  await quickView.getByText("Nhà cung cấp hạ tầng 721", { exact: true }).click();
  await quickView.getByLabel("Mục đích chi / Diễn giải").fill("Gia hạn hạ tầng vận hành");
  await quickView.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(quickView.getByLabel("Mục đích chi / Diễn giải")).toHaveValue(
    "Gia hạn hạ tầng vận hành",
  );
  await expect(quickView.getByText("Giá trị & Hạch toán")).toHaveCount(0);
});

test("@desktop table column visibility persists in application configuration", async ({ page }) => {
  await install(page);
  await page.goto("http://localhost:3000/documents");
  const tableSearch = page.getByRole("searchbox", { name: "Tìm kiếm trong bảng" });
  const columnButton = page.getByRole("button", { name: "Cột hiển thị" });
  await expect(tableSearch).toBeVisible();
  await expect(columnButton).toHaveAttribute("data-size", "sm");
  await tableSearch.fill("INV-720");
  await expect(page.getByText("INV-720")).toBeVisible();
  await expect(page.getByText("Ghi nhận doanh thu thiết kế web")).toBeHidden();
  await tableSearch.clear();
  await expect(page.getByText("Ghi nhận doanh thu thiết kế web")).toBeVisible();
  await columnButton.click();
  await page.getByRole("menuitemcheckbox", { name: "Đối tượng" }).click();
  await expect(page.getByRole("columnheader", { name: "Đối tượng" })).toBeHidden();
  await page.reload();
  await expect(page.getByRole("columnheader", { name: "Đối tượng" })).toBeHidden();
});

test("@desktop revenue invoice-presence filter isolates recognition activity", async ({ page }) => {
  await install(page);
  await page.goto("http://localhost:3000/documents");
  await page.getByRole("button", { name: "Bộ lọc" }).click();
  const filters = page.locator('[data-slot="popover-content"]');
  await filters.getByLabel("Tình trạng hóa đơn").click();
  await page.getByRole("option", { name: "Chưa có hóa đơn" }).click();
  await filters.getByRole("button", { name: "Áp dụng" }).click();
  await expect(page).toHaveURL(/invoiceStatus=missing/);
  await expect(page.getByText("Ghi nhận doanh thu thiết kế web")).toBeVisible();
  await expect(page.getByText("INV-720")).toHaveCount(0);
});

test("@desktop exports revenue and expense XLSX with current URL filters and clear filenames", async ({
  page,
}) => {
  await install(page);
  await page.goto(
    "http://localhost:3000/documents?startsOn=2026-08-01&endsOn=2026-08-31&state=posted&partyId=client-720&projectId=project-720&invoiceStatus=missing",
  );
  const revenueRequest = page.waitForRequest((request) =>
    request.url().includes("/accounting-list-exports/sales-invoices"),
  );
  const revenueDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Xuất danh sách XLSX" }).click();
  const revenueUrl = new URL((await revenueRequest).url());
  expect(Object.fromEntries(revenueUrl.searchParams)).toEqual({
    startsOn: "2026-08-01",
    endsOn: "2026-08-31",
    state: "posted",
    projectId: "project-720",
    partyId: "client-720",
    invoicePresence: "missing",
  });
  expect((await revenueDownload).suggestedFilename()).toBe(
    "naai-erp-doanh-thu-2026-08-01_2026-08-31.xlsx",
  );

  await page.goto(
    "http://localhost:3000/expenses?startsOn=2026-08-01&endsOn=2026-08-31&state=draft&payeePartyId=supplier-720&invoiceStatus=present",
  );
  const expenseRequest = page.waitForRequest((request) =>
    request.url().includes("/accounting-list-exports/purchase-invoices-expenses"),
  );
  const expenseDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Xuất danh sách XLSX" }).click();
  const expenseUrl = new URL((await expenseRequest).url());
  expect(Object.fromEntries(expenseUrl.searchParams)).toEqual({
    startsOn: "2026-08-01",
    endsOn: "2026-08-31",
    state: "draft",
    payeePartyId: "supplier-720",
    invoicePresence: "present",
  });
  expect((await expenseDownload).suggestedFilename()).toBe(
    "naai-erp-chi-phi-2026-08-01_2026-08-31.xlsx",
  );
});

test("@desktop shows export loading and structured failure without disturbing the list", async ({
  page,
}) => {
  await install(page);
  await page.unroute("**/api/v1/organizations/naai/accounting-list-exports/**");
  await page.route(
    "**/api/v1/organizations/naai/accounting-list-exports/sales-invoices**",
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      await fail(route, 422, "EXPORT_FILTER_INVALID", "Khoảng ngày export không hợp lệ");
    },
  );
  await page.goto("http://localhost:3000/documents");
  await page.getByRole("button", { name: "Xuất danh sách XLSX" }).click();
  await expect(page.getByRole("button", { name: "Đang export..." })).toBeDisabled();
  await expect(page.getByText("Không thể export dữ liệu")).toBeVisible();
  await expect(page.getByText("Khoảng ngày export không hợp lệ")).toBeVisible();
  await expect(page.getByText("INV-720")).toBeVisible();
});

test("@desktop T-MVP-UI-002 creates a non-invoice expense then opens its stable detail", async ({
  page,
}) => {
  await install(page);
  await page.goto("http://localhost:3000/expenses");
  await page.getByRole("button", { name: "Tạo chi phí" }).click();
  const dialog = page.getByRole("dialog", { name: "Tạo chi phí" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Đối tác thụ hưởng").fill("Nhà cung cấp");
  await dialog.getByText("Nhà cung cấp 720", { exact: true }).click();
  await expect(dialog.getByLabel("Đối tác thụ hưởng")).toHaveValue("Nhà cung cấp 720");
  await expect(dialog.getByLabel("Nhân viên thực hiện")).toContainText("-- Không chọn --");
  await dialog.getByLabel("Nhân viên thực hiện").click();
  await page.getByRole("option", { name: "Nguyễn Nhân Viên" }).click();
  await expect(dialog.getByLabel("Nhân viên thực hiện")).toContainText("Nguyễn Nhân Viên");
  await dialog.getByLabel("Dự án").click();
  await page.getByRole("option", { name: "Dự án khách hàng 720" }).click();
  await expect(dialog.getByLabel("Hợp đồng")).toHaveCount(0);
  await expect(dialog.getByText(/Chính sách danh mục: tax_only_non_cash/)).toBeVisible();
  await dialog.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Chi phí không hóa đơn" }).click();
  await dialog.getByLabel("Mục đích chi / Diễn giải").fill("Phí vận hành");
  await dialog.getByLabel("Tiền gốc chưa VAT (VNĐ)").fill("2000000");
  await dialog.getByRole("button", { name: "Lưu chi phí nháp" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/expenses$/);
  await expect(page.getByText("Phí vận hành").first()).toBeVisible();
});

test("@desktop edits a draft invoice through PATCH and reloads the new resource version", async ({
  page,
}) => {
  await install(page);
  await page.goto("http://localhost:3000/documents/invoice-720");
  await page.getByRole("button", { name: "Sửa draft" }).click();
  const dialog = page.getByRole("dialog", { name: "Sửa draft hoạt động doanh thu" });
  await dialog.getByLabel("Số hóa đơn").fill("INV-720-EDITED");
  await dialog.getByRole("button", { name: "Lưu thay đổi hóa đơn" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("INV-720-EDITED", { exact: true })).toBeVisible();
});

test("@desktop relationship-aware expense edit preserves allocation IDs and dimensions", async ({
  page,
}) => {
  await install(page);
  await page.goto("http://localhost:3000/expenses");
  const expenseRow = page.getByRole("row").filter({ hasText: "Phí vận hành" });
  await expenseRow.getByRole("button", { name: "Xem" }).click();
  const dialog = page.getByRole("dialog", { name: "Chi tiết & Chỉnh sửa hoạt động chi phí" });
  await expect(dialog.getByLabel("Dự án")).toContainText("Dự án khách hàng 720");
  await expect(dialog.getByLabel("Hợp đồng")).toHaveCount(0);
  await dialog.getByLabel("Tiền gốc chưa VAT (VNĐ)").fill("2.500.000");
  await dialog.getByRole("button", { name: "Cập nhật thông tin chi phí" }).click();
  await expect(dialog.getByLabel("Dự án")).toContainText("Dự án khách hàng 720");
});

test("@desktop blocks an invoice due date before its document date", async ({ page }) => {
  await install(page);
  await page.goto("http://localhost:3000/documents/invoice-720");
  await page.getByRole("button", { name: "Sửa draft" }).click();
  const dialog = page.getByRole("dialog", { name: "Sửa draft hoạt động doanh thu" });
  await dialog.getByLabel("Ngày hóa đơn").fill("2026-08-21");
  await dialog.getByLabel("Hạn thanh toán").fill("2026-08-20");
  await expect(dialog.getByLabel("Hạn thanh toán")).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByText("Hạn thanh toán không được trước ngày hóa đơn.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Lưu thay đổi hóa đơn" })).toBeDisabled();
});

test("@desktop reports stale draft edit conflicts without closing the form", async ({ page }) => {
  await install(page, {
    kind: "documents",
    status: 409,
    code: "RESOURCE_VERSION_CONFLICT",
    message: "Bản ghi đã được cập nhật bởi người khác.",
  });
  await page.goto("http://localhost:3000/documents/invoice-720");
  await page.getByRole("button", { name: "Sửa draft" }).click();
  const dialog = page.getByRole("dialog", { name: "Sửa draft hoạt động doanh thu" });
  await dialog.getByRole("button", { name: "Lưu thay đổi hóa đơn" }).click();
  await expect(dialog).toBeVisible();
  await expect(page.getByText("Bản ghi đã được cập nhật bởi người khác.")).toBeVisible();
});

test("@desktop reports an expense that stopped being draft during edit", async ({ page }) => {
  await install(page, {
    kind: "expenses",
    status: 409,
    code: "EXPENSE_NOT_DRAFT",
    message: "Chỉ chi phí draft mới có thể sửa.",
  });
  await page.goto("http://localhost:3000/expenses/expense-720");
  await page.getByRole("button", { name: "Sửa draft" }).click();
  const dialog = page.getByRole("dialog", { name: "Sửa draft hoạt động chi phí" });
  await dialog.getByRole("button", { name: "Lưu thay đổi chi phí" }).click();
  await expect(dialog).toBeVisible();
  await expect(page.getByText("Chỉ chi phí draft mới có thể sửa.")).toBeVisible();
});

test("@mobile focused invoice and expense routes do not overflow", async ({ page }) => {
  await install(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "/documents",
    "/documents/invoice-720",
    "/expenses",
    "/expenses/expense-720",
  ]) {
    await page.goto(`http://localhost:3000${route}`);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }
});
