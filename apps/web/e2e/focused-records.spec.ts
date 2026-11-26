import { expect, test } from "@playwright/test";
import {
  fail,
  install,
  invoiceWithoutRootCategory,
  reply,
  snakeCaseExpensesEnvelope,
} from "./focused-records.fixtures";

test("@desktop T-E2E-ERP-841-003 revenue category chart defaults management to invoiced and non-invoice activity", async ({
  page,
}) => {
  await install(page);
  await page.goto("/revenue?startsOn=2025-01-01&endsOn=2026-12-31");
  await expect(page.getByRole("heading", { level: 1, name: "Quản lý doanh thu" })).toBeVisible();
  await expect(page.getByText("INV-720")).toBeVisible();
  await expect(page.getByText("Ghi nhận doanh thu thiết kế web")).toBeVisible();
  await expect(
    page.getByText("Doanh thu Phát triển phần mềm / App", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Doanh thu đã ghi nhận", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Bộ lọc" }).click();
  const filters = page.locator('[data-slot="popover-content"]');
  await filters.getByLabel("Tình trạng hóa đơn").click();
  await page.getByRole("option", { name: "Có hóa đơn", exact: true }).click();
  await filters.getByRole("button", { name: "Áp dụng" }).click();
  await expect(page).toHaveURL(/invoiceStatus=present/);
  await page.getByRole("button", { name: "Xem" }).first().click();
  const quickView = page.getByRole("dialog", { name: "Chi tiết & Chỉnh sửa hoạt động doanh thu" });
  await expect(quickView.getByText("11.000.000 ₫")).toBeVisible();
  await page.goto("/revenue/invoice-720");
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
  await page.goto("/revenue");
  await expect(page.getByRole("columnheader", { name: "Khách hàng" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Dự án" })).toBeVisible();
  await expect(page.getByText("Dự án khách hàng 720", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Tạo hóa đơn bán ra" }).click();
  const dialog = page.getByRole("dialog", { name: "Tạo hóa đơn" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Khách hàng 720", { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText("client-720", { exact: true })).toHaveCount(0);
  await dialog.getByLabel("Dự án", { exact: true }).click();
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
  await page.goto("/expenses");
  await expect(page.getByRole("heading", { level: 1, name: "Quản lý chi phí" })).toBeVisible();
  await expect(page.getByText("PINV-720")).toBeVisible();
  await expect(page.getByText("Phí vận hành")).toBeVisible();
  await expect(page.getByText("Nhà cung cấp 720", { exact: true }).first()).toBeVisible();
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
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Nguồn thanh toán", { exact: true })).toBeVisible();
  await expect(
    dialog.locator('[data-slot="card-title"]').filter({ hasText: "Quỹ tiền mặt công ty (TK 111)" }),
  ).toBeVisible();
  await expect(dialog.getByLabel("Dự án", { exact: true })).toContainText("Dự án khách hàng 720");
});

test("@desktop deletes only a canonical draft purchase invoice from Expense Management", async ({
  page,
}) => {
  await install(page);
  await page.goto("/expenses?invoiceStatus=present");
  const invoiceRow = page.getByRole("row").filter({ hasText: "PINV-720" });
  await invoiceRow.getByRole("button", { name: "Xem" }).click();
  const quickView = page.getByRole("dialog", { name: "Chi tiết & Chỉnh sửa hoạt động chi phí" });
  await quickView.getByRole("button", { name: "Xóa hóa đơn nháp" }).click();
  const confirmation = page.getByRole("dialog", { name: "Xóa hóa đơn mua vào bản nháp?" });
  await expect(confirmation.getByRole("button", { name: "Xác nhận xóa" })).toBeDisabled();
  await confirmation.getByLabel("Lý do xóa").fill("Hóa đơn nhập trùng");
  await confirmation.getByRole("button", { name: "Xác nhận xóa" }).click();
  await expect(confirmation).not.toBeVisible();
  await expect(quickView).not.toBeVisible();
  await expect(page.getByText("Đã xóa hóa đơn mua vào bản nháp.")).toBeVisible();
  await expect(page.getByText("PINV-720")).toHaveCount(0);
});

test("@desktop does not expose draft deletion for a posted purchase invoice", async ({ page }) => {
  await install(page, undefined, "draft", "posted");
  await page.goto("/expenses?invoiceStatus=present");
  await page
    .getByRole("row")
    .filter({ hasText: "PINV-720" })
    .getByRole("button", { name: "Xem" })
    .click();
  const quickView = page.getByRole("dialog", { name: "Chi tiết & Chỉnh sửa hoạt động chi phí" });
  await expect(quickView.getByRole("button", { name: "Xóa hóa đơn nháp" })).toHaveCount(0);
});

test("@desktop does not expose deletion when a draft purchase invoice already has a journal", async ({
  page,
}) => {
  await install(page, undefined, "draft", "draft", true);
  await page.goto("/expenses?invoiceStatus=present");
  await page
    .getByRole("row")
    .filter({ hasText: "PINV-720" })
    .getByRole("button", { name: "Xem" })
    .click();
  const quickView = page.getByRole("dialog", { name: "Chi tiết & Chỉnh sửa hoạt động chi phí" });
  await expect(quickView.getByRole("button", { name: "Xóa hóa đơn nháp" })).toHaveCount(0);
});

test("@desktop T-E2E-ERP-877-002 posted expense metadata uses one clear save action", async ({
  page,
}) => {
  await install(page, undefined, "posted");
  await page.goto("/expenses?invoiceStatus=missing");
  await page.getByRole("button", { name: "Xem" }).click();
  const quickView = page.getByRole("dialog", { name: "Chi tiết & Chỉnh sửa hoạt động chi phí" });
  await expect(quickView.getByRole("button", { name: "Lưu danh mục" })).toHaveCount(0);
  await expect(quickView.getByRole("link", { name: "Mở trang chi tiết" })).toHaveCount(0);
  await expect(quickView.getByRole("button", { name: "Lưu thay đổi" })).toHaveCount(1);
  await quickView.getByLabel("Đối tác thụ hưởng").fill("hạ tầng");
  await quickView.getByText("Nhà cung cấp hạ tầng 721", { exact: true }).click();
  await quickView.getByLabel("Mục đích chi / Diễn giải").fill("Gia hạn hạ tầng vận hành");
  await quickView.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(quickView.getByLabel("Mục đích chi / Diễn giải")).toHaveValue(
    "Gia hạn hạ tầng vận hành",
  );
  await expect(quickView.getByText("Giá trị & Hạch toán")).toHaveCount(0);
});

test("@desktop table search and column visibility persist in application configuration", async ({
  page,
}) => {
  await install(page);
  await page.goto("/expenses?invoiceStatus=present");
  const tableSearch = page.getByRole("searchbox", { name: "Tìm kiếm trong bảng" });
  const columnButton = page.getByRole("button", { name: "Cột hiển thị" });
  await expect(tableSearch).toBeVisible();
  await expect(columnButton).toHaveAttribute("data-size", "sm");
  await expect(page.getByText("PINV-720")).toBeVisible();
  await tableSearch.fill("khong-co-ban-ghi-nay");
  await expect(page.getByText("PINV-720")).toBeHidden();
  await tableSearch.clear();
  await expect(page.getByText("PINV-720")).toBeVisible();
  await columnButton.click();
  await page.getByRole("menuitemcheckbox", { name: "Chi cho ai" }).click();
  await expect(page.getByRole("columnheader", { name: "Chi cho ai" })).toBeHidden();
  await page.reload();
  await expect(page.getByRole("columnheader", { name: "Chi cho ai" })).toBeHidden();
});

test("@desktop revenue invoice-presence filter isolates recognition activity", async ({ page }) => {
  await install(page);
  await page.goto("/revenue?startsOn=2025-01-01&endsOn=2026-12-31");
  await page.getByRole("button", { name: "Bộ lọc" }).click();
  const filters = page.locator('[data-slot="popover-content"]');
  await filters.getByLabel("Tình trạng hóa đơn").click();
  await page.getByRole("option", { name: "Chưa có hóa đơn" }).click();
  await filters.getByRole("button", { name: "Áp dụng" }).click();
  await expect(page).toHaveURL(/invoiceStatus=missing/);
  await expect(page.getByText("Ghi nhận doanh thu thiết kế web")).toBeVisible();
  await expect(page.getByText("2025-06-30", { exact: true })).toBeVisible();
  await expect(page.getByText("Khách hàng 720", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Dự án khách hàng 720", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("INV-720")).toHaveCount(0);
});

test("@desktop recognition date filtering uses effectiveOn rather than createdAt", async ({
  page,
}) => {
  await install(page);
  await page.goto("/revenue?invoiceStatus=missing&startsOn=2025-01-01&endsOn=2025-12-31");
  await expect(page.getByText("Ghi nhận doanh thu thiết kế web")).toBeVisible();
  await expect(page.getByText("2025-06-30", { exact: true })).toBeVisible();
});

test("@desktop expense list renders the canonical snake_case API fields", async ({ page }) => {
  await install(page);
  await page.route("**/api/v1/organizations/naai/expenses?**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(snakeCaseExpensesEnvelope),
    }),
  );
  await page.goto("/expenses?startsOn=2026-01-01&endsOn=2026-12-31&invoiceStatus=missing");
  await expect(page.getByText("2026-07-29", { exact: true })).toBeVisible();
  await expect(page.getByText("Imported company expense", { exact: true })).toBeVisible();
  await expect(page.getByText("408.601 ₫", { exact: true })).toBeVisible();
});

test("@desktop production-backed newest purchase invoice renders its category", async ({
  page,
}) => {
  await install(page);
  await page.route("**/api/v1/organizations/naai/commercial-documents?**", (route) =>
    reply(route, { items: [invoiceWithoutRootCategory] }),
  );
  await page.route(
    "**/api/v1/organizations/naai/commercial-documents/invoice-category-line",
    (route) => reply(route, invoiceWithoutRootCategory),
  );
  await page.goto("/revenue?startsOn=2026-01-01&endsOn=2026-12-31");
  await expect(page.getByText("INV-CATEGORY-LINE", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Doanh thu Phát triển phần mềm / App", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Xem" }).first().click();
  await expect(
    page
      .getByRole("dialog", { name: "Chi tiết & Chỉnh sửa hoạt động doanh thu" })
      .getByText("Doanh thu Phát triển phần mềm / App", { exact: true })
      .first(),
  ).toBeVisible();
});

test("@desktop exports revenue and expense XLSX with current URL filters and clear filenames", async ({
  page,
}) => {
  await install(page);
  await page.goto(
    "/revenue?startsOn=2026-08-01&endsOn=2026-08-31&state=posted&partyId=client-720&projectId=project-720&invoiceStatus=missing",
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
    "/expenses?startsOn=2026-08-01&endsOn=2026-08-31&state=draft&payeePartyId=supplier-720&invoiceStatus=present",
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
  await page.goto("/revenue");
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
  await page.goto("/expenses");
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
  await dialog.getByLabel("Dự án", { exact: true }).click();
  await page.getByRole("option", { name: "Dự án khách hàng 720" }).click();
  await expect(dialog.getByLabel("Hợp đồng")).toHaveCount(0);
  await dialog.getByRole("combobox").nth(3).click();
  await page.getByRole("option", { name: "Chi phí Ăn uống / Tiếp khách" }).click();
  await expect(dialog.getByText(/Chính sách danh mục: tax_only_non_cash/)).toBeVisible();
  await dialog.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Chi phí không hóa đơn" }).click();
  await dialog.getByLabel("Mục đích chi / Diễn giải").fill("Phí vận hành");
  await dialog.getByLabel("Tiền gốc chưa VAT (VNĐ)").fill("2000000");
  await dialog.getByRole("button", { name: "Lưu bản nháp" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/expenses$/);
  await expect(page.getByText("Phí vận hành").first()).toBeVisible();
});

test("@desktop edits a draft invoice through PATCH and reloads the new resource version", async ({
  page,
}) => {
  await install(page);
  await page.goto("/documents/invoice-720");
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
  await page.goto("/expenses");
  const expenseRow = page.getByRole("row").filter({ hasText: "Phí vận hành" });
  await expenseRow.getByRole("button", { name: "Xem" }).click();
  const dialog = page.getByRole("dialog", { name: "Chi tiết & Chỉnh sửa hoạt động chi phí" });
  await expect(dialog.getByLabel("Dự án", { exact: true })).toContainText("Dự án khách hàng 720");
  await expect(dialog.getByLabel("Hợp đồng")).toHaveCount(0);
  await dialog.getByLabel("Tiền gốc chưa VAT (VNĐ)").fill("2.500.000");
  await dialog.getByRole("button", { name: "Cập nhật thông tin chi phí" }).click();
  await expect(dialog.getByLabel("Dự án", { exact: true })).toContainText("Dự án khách hàng 720");
});

test("@desktop blocks an invoice due date before its document date", async ({ page }) => {
  await install(page);
  await page.goto("/documents/invoice-720");
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
  await page.goto("/documents/invoice-720");
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
  await page.goto("/expenses/expense-720");
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
    "/revenue",
    "/documents/invoice-720",
    "/expenses",
    "/expenses/expense-720",
  ]) {
    await page.goto(route);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test("@desktop voids a posted expense with a reason through a reversing journal", async ({
  page,
}) => {
  await install(page, undefined, "posted");
  await page.goto("/expenses?invoiceStatus=missing");
  await page.getByRole("button", { name: "Xem" }).click();
  const quickView = page.getByRole("dialog", { name: "Chi tiết & Chỉnh sửa hoạt động chi phí" });
  await quickView.getByRole("button", { name: "Void (đảo bút toán)" }).click();
  const confirmation = page.getByRole("dialog", { name: "Void chi phí đã ghi sổ?" });
  await expect(confirmation.getByRole("button", { name: "Xác nhận" })).toBeDisabled();
  await confirmation.getByLabel("Lý do (bắt buộc)").fill("Nhập nhầm số tiền");
  await confirmation.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText("Đã void chi phí bằng bút toán đảo.")).toBeVisible();
  await expect(confirmation).not.toBeVisible();
  await expect(quickView).not.toBeVisible();
});

test("@desktop offers no void for a draft expense other than discarding it", async ({ page }) => {
  await install(page);
  await page.goto("/expenses?invoiceStatus=missing");
  await page.getByRole("button", { name: "Xem" }).click();
  const quickView = page.getByRole("dialog", { name: "Chi tiết & Chỉnh sửa hoạt động chi phí" });
  await expect(quickView.getByRole("button", { name: "Xóa bản nháp" })).toBeVisible();
  await expect(quickView.getByRole("button", { name: "Void (đảo bút toán)" })).toHaveCount(0);
});

test("@desktop remembers hidden table columns across reloads and route changes", async ({
  page,
}) => {
  await install(page);
  await page.goto("/expenses?invoiceStatus=missing");
  await page.getByRole("button", { name: "Cột hiển thị" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Nội dung / Diễn giải" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("columnheader", { name: "Nội dung / Diễn giải" })).toBeHidden();
  // The choice is stored by column label under the route, so it survives reloads...
  await page.reload();
  await expect(page.getByRole("columnheader", { name: "Mã bản ghi" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Nội dung / Diễn giải" })).toBeHidden();
  // ...and a different filter on the same route (different URL query) keeps it too.
  await page.goto("/expenses?invoiceStatus=present");
  await expect(page.getByRole("columnheader", { name: "Mã bản ghi" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Nội dung / Diễn giải" })).toBeHidden();
  const stored = await page.evaluate(() =>
    Object.fromEntries(
      Object.entries(window.localStorage).filter(([key]) =>
        key.startsWith("naai-erp-table-columns"),
      ),
    ),
  );
  expect(stored).toEqual({ "naai-erp-table-columns-v2:/expenses": '["Nội dung / Diễn giải"]' });
});

test("@desktop shows the organization's operating mode in the page header", async ({ page }) => {
  await install(page);
  await page.goto("/expenses?invoiceStatus=present");
  const badge = page.getByTestId("operating-mode-badge");
  await expect(badge).toHaveText(/Chế độ: Một người/);
  await badge.hover();
  await expect(page.getByRole("tooltip").first()).toContainText("Lưu và ghi nhận");
});

test("@desktop moves a posted expense to the owner-held custody cash fund", async ({ page }) => {
  await install(page, undefined, "posted");
  await page.goto("/expenses?invoiceStatus=missing");
  await page.getByRole("button", { name: "Xem" }).click();
  const quickView = page.getByRole("dialog", { name: "Chi tiết & Chỉnh sửa hoạt động chi phí" });
  await quickView.getByRole("button", { name: "Đổi nguồn thanh toán" }).click();
  const dialog = page.getByRole("dialog", { name: "Đổi sang nguồn thanh toán khác?" });
  await dialog.getByLabel("Nguồn thanh toán mới").click();
  // Both cash funds are offered although they share ledger account 111.
  await expect(page.getByRole("option", { name: /Quỹ tiền mặt công ty/ })).toBeVisible();
  await page.getByRole("option", { name: /Tiền công ty chủ giữ hộ/ }).click();
  await dialog.getByLabel("Lý do điều chỉnh").fill("Chi từ tiền công ty chủ giữ hộ");
  await dialog.getByRole("button", { name: /Xác nhận/ }).click();
  await expect(page.getByText(/Đã đảo bút toán cũ và tạo bản thay thế/)).toBeVisible();
});
