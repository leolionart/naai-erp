import { expect, test, type Page, type Route } from "@playwright/test";

function envelope(data: unknown) {
  return { apiVersion: "v1", requestId: "erp430-e2e", organizationId: "org-demo", data };
}

async function reply(route: Route, data: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
}

function report(side: "ar" | "ap", party = false) {
  const ar = side === "ar";
  const partyId = ar ? "customer-1" : "supplier-1";
  const partyName = ar ? "Acme Client" : "Cloud Vendor";
  const accountCode = ar ? "131-AR" : "331-AP";
  const drilldown = (sourceId: string) => ({
    sourceType: "commercial_document",
    sourceId,
    journalIds: ["journal-source-1", "journal-allocation-1"],
    reconciliationIds: ["reconciliation-1"],
    evidenceIds: ["evidence-1"],
    sourceHref: `/documents?documentId=${sourceId}`,
    journalHrefs: [
      "/accounting/journals?journalId=journal-source-1",
      "/accounting/journals?journalId=journal-allocation-1",
    ],
    reconciliationHrefs: ["/banking/reconciliation/bank-transaction-1"],
    evidenceHrefs: ["/evidence?evidenceId=evidence-1"],
  });
  return {
    schemaVersion: 1,
    organizationId: "org-demo",
    side,
    asOf: "2026-08-05",
    timezone: "Asia/Ho_Chi_Minh",
    baseCurrency: "VND",
    source: "posted-ledger",
    filters: party ? { partyId } : {},
    bucketTotals: [
      { bucket: "current", amountMinor: "10000000", baseAmountMinor: "10000000", itemCount: 1 },
      { bucket: "31_60", amountMinor: "30000000", baseAmountMinor: "30000000", itemCount: 1 },
      { bucket: "over_90", amountMinor: "50000000", baseAmountMinor: "50000000", itemCount: 1 },
    ],
    creditOrAdvanceTotalMinor: ar ? "5000000" : "7000000",
    baseCreditOrAdvanceTotalMinor: ar ? "5000000" : "7000000",
    outstandingTotalMinor: "145000000",
    baseOutstandingTotalMinor: "145000000",
    items: [
      {
        id: ar ? "invoice-1" : "bill-1",
        side,
        partyId,
        partyName,
        documentNumber: ar ? "INV-2026-001" : "BILL-2026-001",
        documentDate: "2026-05-01",
        dueDate: "2026-05-31",
        currency: "VND",
        originalMinor: "110000000",
        settledMinor: "60000000",
        outstandingMinor: "50000000",
        signedOutstandingMinor: ar ? "50000000" : "-50000000",
        baseOutstandingMinor: "50000000",
        signedBaseOutstandingMinor: ar ? "50000000" : "-50000000",
        balanceKind: ar ? "receivable" : "payable",
        bucket: "61_90",
        daysOverdue: 66,
        paymentStatus: "partially_paid",
        controlAccountCode: accountCode,
        drilldown: drilldown(ar ? "sales-doc-1" : "purchase-doc-1"),
      },
      {
        id: ar ? "credit-1" : "advance-1",
        side,
        partyId,
        partyName,
        documentNumber: ar ? "CN-001" : "ADV-001",
        documentDate: "2026-08-01",
        dueDate: "2026-08-01",
        currency: "VND",
        originalMinor: ar ? "5000000" : "7000000",
        settledMinor: "0",
        outstandingMinor: ar ? "5000000" : "7000000",
        signedOutstandingMinor: ar ? "-5000000" : "7000000",
        baseOutstandingMinor: ar ? "5000000" : "7000000",
        signedBaseOutstandingMinor: ar ? "-5000000" : "7000000",
        balanceKind: ar ? "customer_credit" : "supplier_advance",
        bucket: "current",
        paymentStatus: "unpaid",
        controlAccountCode: accountCode,
        drilldown: drilldown(ar ? "credit-source-1" : "advance-source-1"),
      },
    ],
    exceptions: ar
      ? []
      : [
          {
            code: "CONTROL_ACCOUNT_OUT_OF_BALANCE",
            itemId: "bill-1",
            message: "Chênh lệch control account",
          },
        ],
    controlTies: [
      {
        controlAccountCode: accountCode,
        currency: "VND",
        status: ar ? "tied" : "out_of_balance",
        ledgerBalanceMinor: ar ? "145000000" : "144000000",
        subledgerBalanceMinor: "145000000",
        differenceMinor: ar ? "0" : "-1000000",
        ledgerBaseBalanceMinor: ar ? "145000000" : "144000000",
        subledgerBaseBalanceMinor: "145000000",
        baseDifferenceMinor: ar ? "0" : "-1000000",
      },
    ],
    tieStatus: ar ? "tied" : "out_of_balance",
  };
}

async function installApi(page: Page) {
  const requested: string[] = [];
  await page.route(
    "http://localhost:3001/api/v1/organizations/org-demo/reports/**",
    async (route) => {
      const url = new URL(route.request().url());
      requested.push(`${url.pathname}${url.search}`);
      const side = url.pathname.includes("/ap-aging") ? "ap" : "ar";
      return reply(route, envelope(report(side, url.pathname.includes("/parties/"))));
    },
  );
  return requested;
}

test("@desktop keeps AR and AP as separate queues and persists report filters in the URL", async ({
  page,
}) => {
  const requested = await installApi(page);
  await page.goto("http://localhost:3000/receivables?asOf=2026-08-05");
  await expect(page.getByRole("heading", { name: "Công nợ phải thu" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Acme Client" }).first()).toBeVisible();
  await expect(page.getByText("customer_credit")).toBeVisible();
  await expect(page.getByText("Đã tie-out tài khoản kiểm soát")).toBeVisible();

  await page.getByRole("button", { name: "Bộ lọc" }).click();
  const sheet = page.getByRole("dialog", { name: "Bộ lọc tuổi nợ" });
  await sheet.getByLabel("Party ID").fill("customer-1");
  await sheet.getByLabel("Control account").fill("131-AR");
  await sheet.getByLabel("Bucket").fill("31_60");
  await sheet.getByRole("button", { name: "Áp dụng bộ lọc" }).click();
  await expect(page).toHaveURL(/partyId=customer-1/);
  await expect
    .poll(() =>
      requested.some(
        (path) =>
          path.includes("/reports/ar-aging?asOf=2026-08-05") &&
          path.includes("accountCode=131-AR") &&
          path.includes("bucket=31_60"),
      ),
    )
    .toBe(true);

  await page.locator("main").getByRole("link", { name: "Phải trả", exact: true }).click();
  await expect(page).toHaveURL(/\/payables/);
  await expect(page.getByRole("link", { name: "Cloud Vendor" }).first()).toBeVisible();
  await expect(page.getByText("supplier_advance")).toBeVisible();
  await expect(page.getByText("Có chênh lệch tài khoản kiểm soát")).toBeVisible();
});

test("@desktop party detail exposes source, journal, reconciliation and evidence drill-down", async ({
  page,
}) => {
  const requested = await installApi(page);
  await page.goto("http://localhost:3000/receivables/customers/customer-1?asOf=2026-08-05");
  await expect(page.getByRole("heading", { name: "Acme Client" })).toBeVisible();
  await expect(page.getByText("Open items và allocation readback")).toBeVisible();
  await expect(page.getByRole("link", { name: "Nguồn" }).first()).toHaveAttribute(
    "href",
    /documents/,
  );
  await expect(page.getByRole("link", { name: "Journal journal-source-1" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Đối soát/ }).first()).toHaveAttribute(
    "href",
    /banking/,
  );
  await expect(page.getByRole("link", { name: /Chứng từ/ }).first()).toHaveAttribute(
    "href",
    /evidence/,
  );
  expect(
    requested.some((path) => path.includes("/reports/ar-aging/parties/customer-1?asOf=2026-08-05")),
  ).toBe(true);
});

test("@mobile AR queue and supplier detail do not overflow the viewport", async ({ page }) => {
  await installApi(page);
  for (const path of [
    "/receivables?asOf=2026-08-05",
    "/payables/suppliers/supplier-1?asOf=2026-08-05",
  ]) {
    await page.goto(`http://localhost:3000${path}`);
    await page.waitForLoadState("networkidle");
    const metrics = await page.evaluate(() => ({
      body: document.body.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(metrics.body).toBeLessThanOrEqual(metrics.viewport + 1);
    await expect(page.getByRole("button", { name: "Tải lại" })).toBeVisible();
  }
});
