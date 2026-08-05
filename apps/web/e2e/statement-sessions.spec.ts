import { expect, test, type Page, type Route } from "@playwright/test";

function envelope(data: unknown) {
  return { apiVersion: "v1", requestId: "erp440-e2e", organizationId: "org-demo", data };
}
async function reply(route: Route, data: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
}

function session(state = "open", version = "1") {
  return {
    id: "session-aug",
    financialAccountId: "bank-vcb",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    openingBalanceMinor: "100000000",
    closingBalanceMinor: "125000000",
    currency: "VND",
    state,
    resourceVersion: version,
  };
}
function detail(canClose = false, exceptionStatus = "open", version = "1") {
  return {
    session: session(canClose ? "open" : "open", version),
    imports: [
      {
        importId: "import-aug",
        sourceFilename: "vcb-aug.csv",
        rowCount: "3",
        importedCount: "2",
        duplicateCount: "1",
        rejectedCount: "0",
      },
    ],
    exceptions: [
      {
        id: "exception-1",
        bankTransactionId: "bank-tx-3",
        kind: "suspense",
        amountMinor: "1000000",
        currency: "VND",
        ownerId: "finance-owner",
        reason: "Khoản chưa rõ đối tượng",
        reviewDue: "2026-09-03",
        status: exceptionStatus,
        resourceVersion: version,
      },
    ],
    control: {
      balance: {
        openingBalanceMinor: "100000000",
        statementMovementMinor: "25000000",
        expectedClosingMinor: "125000000",
        reportedClosingMinor: "125000000",
        differenceMinor: "0",
        passed: true,
      },
      importDispositions: {
        rowCount: "3",
        importedCount: "2",
        duplicateCount: "1",
        rejectedCount: "0",
        actualRowCount: "3",
        passed: true,
      },
      coverage: {
        transactionCount: 2,
        reconciledCount: 1,
        ignoredCount: 0,
        exceptionCoveredCount: canClose ? 1 : 0,
        uncoveredTransactionIds: canClose ? [] : ["bank-tx-3"],
        passed: canClose,
      },
      ledgerTie: {
        ledgerAccountCode: "1121-VCB",
        statementMovementMinor: "25000000",
        postedLedgerMovementMinor: "25000000",
        differenceMinor: "0",
        passed: true,
      },
      suspense: {
        suspenseCount: 1,
        unapprovedCount: canClose ? 0 : 1,
        unapprovedAmountMinor: canClose ? "0" : "1000000",
        passed: canClose,
      },
      canClose,
      blockingCodes: canClose ? [] : ["TRANSACTION_COVERAGE_INCOMPLETE", "UNAPPROVED_SUSPENSE"],
    },
  };
}

async function installApi(page: Page) {
  let current = detail(false);
  let createBody: Record<string, unknown> | undefined;
  let reviewBody: Record<string, unknown> | undefined;
  let closeBody: Record<string, unknown> | undefined;
  const requested: string[] = [];
  await page.route(
    "http://localhost:3001/api/v1/organizations/org-demo/banking/statement-sessions**",
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      requested.push(`${path}${url.search}`);
      if (request.method() === "GET" && path.endsWith("/statement-sessions"))
        return reply(route, envelope({ items: [session()] }));
      if (request.method() === "POST" && path.endsWith("/statement-sessions")) {
        createBody = request.postDataJSON() as Record<string, unknown>;
        return reply(
          route,
          envelope({ session: current, mutation: { resourceVersion: "1" } }),
          201,
        );
      }
      if (request.method() === "GET" && path.endsWith("/session-aug"))
        return reply(route, envelope(current));
      if (request.method() === "POST" && path.endsWith("/exception-1/approve")) {
        reviewBody = request.postDataJSON() as Record<string, unknown>;
        current = detail(true, "approved", "2");
        return reply(
          route,
          envelope({ exception: current.exceptions[0], control: current.control }),
        );
      }
      if (request.method() === "POST" && path.endsWith("/session-aug/close")) {
        closeBody = request.postDataJSON() as Record<string, unknown>;
        current = { ...detail(true, "approved", "3"), session: session("closed", "3") };
        return reply(route, envelope({ session: current, mutation: { resourceVersion: "3" } }));
      }
      return reply(route, { error: { message: `${request.method()} ${path}` } }, 404);
    },
  );
  return {
    createBody: () => createBody,
    reviewBody: () => reviewBody,
    closeBody: () => closeBody,
    requested,
  };
}

test("@desktop creates a short statement session and keeps queue filters in the URL", async ({
  page,
}) => {
  const api = await installApi(page);
  await page.goto("http://localhost:3000/banking/statements");
  await expect(page.getByRole("link", { name: "2026-08-01 → 2026-08-31" })).toBeVisible();
  await page.getByRole("button", { name: "Bộ lọc" }).click();
  const sheet = page.getByRole("dialog", { name: "Bộ lọc kỳ sao kê" });
  await sheet.getByLabel("Account ID").fill("bank-vcb");
  await sheet.getByLabel("Trạng thái").fill("open");
  await sheet.getByRole("button", { name: "Áp dụng" }).click();
  await expect(page).toHaveURL(/accountId=bank-vcb/);
  await expect
    .poll(() => api.requested.some((path) => path.includes("financialAccountId=bank-vcb")))
    .toBe(true);

  await page.getByRole("button", { name: "Tạo kỳ sao kê" }).click();
  const dialog = page.getByRole("dialog", { name: "Tạo kỳ kiểm soát sao kê" });
  await dialog.getByLabel("Financial account ID").fill("bank-vcb");
  await dialog.getByLabel("Từ ngày").fill("2026-08-01");
  await dialog.getByLabel("Đến ngày").fill("2026-08-31");
  await dialog.getByLabel("Opening balance").fill("100000000");
  await dialog.getByLabel("Closing balance").fill("125000000");
  await dialog.getByLabel("Import IDs").fill("import-aug");
  await dialog.getByLabel("Lý do").fill("Monthly bank control");
  await dialog.getByRole("button", { name: "Tạo session" }).click();
  expect(api.createBody()).toMatchObject({
    schemaVersion: 1,
    financialAccountId: "bank-vcb",
    importIds: ["import-aug"],
    reason: "Monthly bank control",
  });
});

test("@desktop surfaces close blockers, approves exception with reason and closes only when ready", async ({
  page,
}) => {
  const api = await installApi(page);
  await page.goto("http://localhost:3000/banking/statements/session-aug");
  await expect(page.getByText(/Blockers: TRANSACTION_COVERAGE_INCOMPLETE/)).toBeVisible();
  await page.getByRole("button", { name: "Đóng kỳ sao kê" }).click();
  const blocked = page.getByRole("alertdialog", { name: "Đóng kỳ sao kê?" });
  await expect(blocked.getByText(/Không thể đóng/)).toBeVisible();
  await expect(blocked.getByRole("button", { name: "Xác nhận đóng kỳ" })).toBeDisabled();
  await blocked.getByRole("button", { name: "Chưa đóng" }).click();

  await page.getByRole("button", { name: "Duyệt" }).click();
  const review = page.getByRole("dialog", { name: "Duyệt exception" });
  await review.getByLabel("Lý do audit").fill("Đã xác minh khoản suspense");
  await review.getByRole("button", { name: "Xác nhận" }).click();
  expect(api.reviewBody()).toMatchObject({
    schemaVersion: 1,
    expectedResourceVersion: "1",
    reason: "Đã xác minh khoản suspense",
  });
  await expect(page.getByText("Sẵn sàng đóng kỳ")).toBeVisible();

  await page.getByRole("button", { name: "Đóng kỳ sao kê" }).click();
  const close = page.getByRole("alertdialog", { name: "Đóng kỳ sao kê?" });
  await close.getByLabel("Lý do đóng kỳ").fill("Control totals passed");
  await close.getByRole("button", { name: "Xác nhận đóng kỳ" }).click();
  expect(api.closeBody()).toMatchObject({
    schemaVersion: 1,
    expectedResourceVersion: "2",
    reason: "Control totals passed",
  });
});

test("@mobile statement queue and control detail keep actions inside the viewport", async ({
  page,
}) => {
  await installApi(page);
  for (const path of ["/banking/statements", "/banking/statements/session-aug"]) {
    await page.goto(`http://localhost:3000${path}`);
    await page.waitForLoadState("networkidle");
    const size = await page.evaluate(() => ({
      body: document.body.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(size.body).toBeLessThanOrEqual(size.viewport + 1);
    await expect(page.getByRole("button", { name: /Tải lại/ })).toBeVisible();
  }
});
