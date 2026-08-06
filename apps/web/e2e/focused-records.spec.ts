import { expect, test, type Page, type Route } from "@playwright/test";

const env = (data: unknown) => ({
  apiVersion: "v1",
  requestId: "erp720",
  organizationId: "org-demo",
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
      allocations: [
        { id: "allocation-1", amountMinor: "10000000", dimensions: { costCenter: "DELIVERY" } },
      ],
    },
  ],
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
        { id: "allocation-2", amountMinor: "2000000", dimensions: { costCenter: "ADMIN" } },
      ],
    },
  ],
};

async function install(
  page: Page,
  patchFailure?: { kind: "documents" | "expenses"; status: number; code: string; message: string },
) {
  let currentInvoice = { ...invoice };
  let currentExpense = { ...expense };
  await page.addInitScript(() => sessionStorage.setItem("naai-erp-admin-token", "erp720-token"));
  await page.route(
    "http://localhost:3001/api/v1/organizations/org-demo/commercial-documents**",
    async (route) => {
      const url = new URL(route.request().url());
      if (route.request().method() === "PATCH" && url.pathname.endsWith("/invoice-720")) {
        if (patchFailure?.kind === "documents")
          return fail(route, patchFailure.status, patchFailure.code, patchFailure.message);
        expect(route.request().headers()["if-match"]).toBe("1");
        const body = route.request().postDataJSON() as typeof invoice;
        currentInvoice = { ...currentInvoice, ...body, resourceVersion: "2" };
        return reply(route, { documentId: currentInvoice.id, resourceVersion: "2" });
      }
      if (route.request().method() === "POST" && url.pathname.endsWith("/commercial-documents"))
        return reply(route, currentInvoice);
      if (url.pathname.endsWith("/invoice-720")) return reply(route, currentInvoice);
      return reply(route, { items: [currentInvoice] });
    },
  );
  await page.route(
    "http://localhost:3001/api/v1/organizations/org-demo/expenses**",
    async (route) => {
      const url = new URL(route.request().url());
      if (route.request().method() === "PATCH" && url.pathname.endsWith("/expense-720")) {
        if (patchFailure?.kind === "expenses")
          return fail(route, patchFailure.status, patchFailure.code, patchFailure.message);
        expect(route.request().headers()["if-match"]).toBe("1");
        const body = route.request().postDataJSON() as typeof expense;
        currentExpense = { ...currentExpense, ...body, resourceVersion: "2" };
        return reply(route, { expenseId: currentExpense.id, resourceVersion: "2" });
      }
      if (route.request().method() === "POST" && url.pathname.endsWith("/expenses"))
        return reply(route, currentExpense);
      if (url.pathname.endsWith("/expense-720")) return reply(route, currentExpense);
      return reply(route, { items: [currentExpense] });
    },
  );
}

test("@desktop T-MVP-UI-001 uses stable invoice list new and detail routes", async ({ page }) => {
  await install(page);
  await page.goto("http://localhost:3000/documents");
  await expect(page.getByText("INV-720")).toBeVisible();
  await page.getByRole("button", { name: "Bộ lọc" }).click();
  const sheet = page.getByRole("dialog", { name: "Bộ lọc hóa đơn" });
  await sheet.getByLabel("Party ID").fill("client-720");
  await sheet.getByRole("button", { name: "Áp dụng" }).click();
  await expect(page).toHaveURL(/partyId=client-720/);
  await page.getByRole("link", { name: "Mở chi tiết" }).click();
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

test("@desktop T-MVP-UI-002 creates a non-invoice expense then opens its stable detail", async ({
  page,
}) => {
  await install(page);
  await page.goto("http://localhost:3000/expenses/new");
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Không có hóa đơn" }).click();
  await page
    .getByText("Mục đích kinh doanh", { exact: true })
    .locator("..")
    .locator("input")
    .fill("Phí vận hành");
  await page
    .getByText("Tiền trước thuế", { exact: true })
    .locator("..")
    .locator("input")
    .fill("2000000");
  await page.getByRole("button", { name: "Lưu chi phí nháp" }).click();
  await expect(page).toHaveURL(/\/expenses\/expense-720$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Chi tiết chi phí" })).toBeVisible();
  await expect(page.getByText("2.000.000 ₫").first()).toBeVisible();
});

test("@desktop edits a draft invoice through PATCH and reloads the new resource version", async ({
  page,
}) => {
  await install(page);
  await page.goto("http://localhost:3000/documents/invoice-720");
  await page.getByRole("button", { name: "Sửa draft" }).click();
  const dialog = page.getByRole("dialog", { name: "Sửa draft hóa đơn" });
  await dialog.getByLabel("Số hóa đơn").fill("INV-720-EDITED");
  await dialog.getByRole("button", { name: "Lưu thay đổi hóa đơn" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("INV-720-EDITED", { exact: true })).toBeVisible();
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
  const dialog = page.getByRole("dialog", { name: "Sửa draft hóa đơn" });
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
  const dialog = page.getByRole("dialog", { name: "Sửa draft chi phí" });
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
