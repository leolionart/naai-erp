import { expect, test, type Page, type Route } from "@playwright/test";

const envelope = (data: unknown) => ({
  apiVersion: "v1",
  requestId: "erp889-e2e",
  organizationId: "naai",
  data,
});

async function json(route: Route, data: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
}

function agingReport() {
  const item = (id: string, sourceId: string, number: string, outstandingMinor: string) => ({
    id,
    side: "ar",
    partyId: "customer-1",
    partyName: "Công ty Khách hàng",
    documentNumber: number,
    documentDate: "2026-08-01",
    dueDate: "2026-08-10",
    currency: "VND",
    originalMinor: outstandingMinor,
    settledMinor: "0",
    outstandingMinor,
    signedOutstandingMinor: outstandingMinor,
    baseOutstandingMinor: outstandingMinor,
    signedBaseOutstandingMinor: outstandingMinor,
    balanceKind: "receivable",
    bucket: "current",
    daysOverdue: 1,
    paymentStatus: "unpaid",
    controlAccountCode: "131-AR",
    drilldown: {
      sourceType: "commercial_document",
      sourceId,
      journalIds: [],
      reconciliationIds: [],
      evidenceIds: [],
      sourceHref: `/documents?documentId=${sourceId}`,
      journalHrefs: [],
      reconciliationHrefs: [],
      evidenceHrefs: [],
    },
  });
  return {
    schemaVersion: 1,
    organizationId: "naai",
    side: "ar",
    asOf: "2026-08-11",
    timezone: "Asia/Ho_Chi_Minh",
    baseCurrency: "VND",
    source: "posted-ledger",
    filters: {},
    bucketTotals: [],
    creditOrAdvanceTotalMinor: "0",
    baseCreditOrAdvanceTotalMinor: "0",
    outstandingTotalMinor: "15000000",
    baseOutstandingTotalMinor: "15000000",
    items: [
      item("aging-1", "sales-invoice-1", "INV-001", "10000000"),
      item("aging-2", "sales-invoice-2", "INV-002", "5000000"),
    ],
    exceptions: [],
    controlTies: [],
    tieStatus: "tied",
  };
}

async function installApi(page: Page, requests: unknown[]) {
  await page.addInitScript(() => sessionStorage.setItem("naai-erp-admin-token", "receipt-token"));
  await page.route("**/api/v1/organizations/naai/reports/ar-aging**", (route) =>
    json(route, envelope(agingReport())),
  );
  await page.route("**/api/v1/organizations/naai/banking/accounts", (route) =>
    json(
      route,
      envelope({
        items: [{ id: "bank-1", displayName: "Vietcombank", currency: "VND", status: "active" }],
      }),
    ),
  );
  await page.route("**/api/v1/organizations/naai/customer-receipts", async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    return json(
      route,
      envelope({
        schemaVersion: 1,
        id: "receipt-1",
        amountMinor: body.amountMinor,
        allocations: body.allocations.map(
          (allocation: { salesInvoiceId: string; amountMinor: string }) => ({
            ...allocation,
            invoiceState:
              allocation.salesInvoiceId === "sales-invoice-1" ? "partially_paid" : "paid",
            invoiceOutstandingMinor:
              allocation.salesInvoiceId === "sales-invoice-1" ? "6000000" : "0",
          }),
        ),
      }),
      201,
    );
  });
}

test("@desktop records one receipt across invoices without exposing technical mutation fields", async ({
  page,
}) => {
  const requests: unknown[] = [];
  await installApi(page, requests);
  await page.goto("/receivables?asOf=2026-08-11");
  await page.getByRole("button", { name: "Ghi nhận đã thu" }).first().click();

  const dialog = page.getByRole("dialog", { name: "Ghi nhận đã thu" });
  await expect(dialog.getByText("INV-001 · còn 10.000.000 ₫")).toBeVisible();
  await expect(dialog.getByText("INV-002 · còn 5.000.000 ₫")).toBeVisible();
  await expect(dialog.getByText(/idempotency|resource version/i)).toHaveCount(0);
  await dialog.getByLabel("Tài khoản nhận tiền").click();
  await page.getByRole("option", { name: /Vietcombank/ }).click();
  await dialog.getByLabel("Số tiền đã thu").fill("9.000.000");
  await dialog.getByLabel(/INV-001/).fill("4.000.000");
  await dialog.getByLabel(/INV-002/).fill("5.000.000");
  await dialog.getByLabel("Ghi chú").fill("Khách chuyển khoản");
  await dialog.getByRole("button", { name: "Ghi nhận khoản thu" }).click();

  const success = page.getByRole("dialog", { name: "Đã ghi nhận tiền thu" });
  await expect(success).toBeVisible();
  await expect(success.getByText("INV-001")).toBeVisible();
  await expect(success.getByText(/Đã thu một phần/)).toBeVisible();
  await expect(success.getByText(/Đã thu đủ/)).toBeVisible();
  expect(requests).toEqual([
    expect.objectContaining({
      financialAccountId: "bank-1",
      amountMinor: "9000000",
      currency: "VND",
      allocations: [
        { salesInvoiceId: "sales-invoice-1", amountMinor: "4000000" },
        { salesInvoiceId: "sales-invoice-2", amountMinor: "5000000" },
      ],
    }),
  ]);
});

test("@mobile explains allocation mismatch and stays inside the viewport", async ({ page }) => {
  await installApi(page, []);
  await page.goto("/receivables/customers/customer-1?asOf=2026-08-11");
  await page.getByRole("button", { name: "Ghi nhận đã thu" }).click();
  const dialog = page.getByRole("dialog", { name: "Ghi nhận đã thu" });
  await dialog.getByLabel("Tài khoản nhận tiền").click();
  await page.getByRole("option", { name: /Vietcombank/ }).click();
  await dialog.getByLabel("Số tiền đã thu").fill("3.000.000");
  await dialog.getByRole("button", { name: "Ghi nhận khoản thu" }).click();
  await expect(
    dialog.getByText("Tổng phân bổ vào hóa đơn phải bằng đúng số tiền đã thu."),
  ).toBeVisible();
  const metrics = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: innerWidth,
  }));
  expect(metrics.body).toBeLessThanOrEqual(metrics.viewport + 1);
});
