import { expect, test, type Page, type Route } from "@playwright/test";

const envelope = (data: unknown) => ({
  apiVersion: "v1",
  requestId: "erp440",
  organizationId: "org-demo",
  data,
});
const reply = (route: Route, data: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });

function summary(state: "draft" | "reviewed" | "closed" = "draft", version = "1") {
  return {
    id: "session-aug",
    financialAccountId: "bank-vcb",
    currency: "VND",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    openingBalanceMinor: "100000000",
    closingBalanceMinor: "125000000",
    importIds: ["import-aug"],
    state,
    resourceVersion: version,
    nextActions: state === "draft" ? ["review"] : state === "reviewed" ? ["close"] : [],
    events: [],
  };
}
function detail(
  stage: "blocked" | "reviewable" | "closable" | "closed" = "blocked",
  version = "1",
) {
  const state = stage === "closable" ? "reviewed" : stage === "closed" ? "closed" : "draft";
  return {
    session: summary(state, version),
    imports: [{ importId: "import-aug", transactionCount: 3, acceptedTransactionCount: 2 }],
    transactions: [
      {
        id: "row-1",
        bankTransactionId: "bank-tx-1",
        importId: "import-aug",
        bookingDate: "2026-08-05",
        amountMinor: "25000000",
        disposition: "accepted",
        controlStatus: "reconciled",
        explanationReference: "recon-1",
      },
    ],
    exceptions: [
      {
        id: "exception-1",
        kind: "suspense",
        bankTransactionId: "bank-tx-3",
        amountMinor: "1000000",
        currency: "VND",
        ownerId: "finance-owner",
        reason: "Khoản chưa rõ đối tượng",
        reviewDue: "2026-09-03",
        state: stage === "blocked" ? "pending" : "approved",
        createdBy: "accountant",
        createdAt: "2026-08-31T10:00:00Z",
      },
    ],
    control: {
      expectedMovementMinor: "25000000",
      controlDifferenceMinor: "0",
      acceptedTransactionCount: 2,
      explainedTransactionCount: stage === "blocked" ? 1 : 2,
      pendingExceptionCount: stage === "blocked" ? 1 : 0,
      closeBlockers:
        stage === "blocked"
          ? ["TRANSACTION_COVERAGE_INCOMPLETE", "UNAPPROVED_SUSPENSE"]
          : stage === "reviewable"
            ? ["SESSION_NOT_REVIEWED"]
            : [],
      closable: stage === "closable",
    },
  };
}

async function installApi(page: Page) {
  let current = detail();
  const bodies: Record<string, Record<string, unknown> | undefined> = {};
  const requested: string[] = [];
  await page.route(
    "http://localhost:3001/api/v1/organizations/org-demo/banking/statement-sessions**",
    async (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        path = url.pathname;
      requested.push(`${path}${url.search}`);
      if (request.method() === "GET" && path.endsWith("/statement-sessions"))
        return reply(route, envelope({ items: [summary()] }));
      if (request.method() === "POST" && path.endsWith("/statement-sessions")) {
        bodies.create = request.postDataJSON();
        return reply(route, envelope({ statementSession: current, mutation: {} }), 201);
      }
      if (request.method() === "GET" && path.endsWith("/session-aug"))
        return reply(route, envelope(current));
      if (request.method() === "POST" && path.endsWith("/exception-1/approve")) {
        bodies.exception = request.postDataJSON();
        current = detail("reviewable", "2");
        return reply(route, envelope({ statementSession: current, mutation: {} }));
      }
      if (request.method() === "POST" && path.endsWith("/session-aug/review")) {
        bodies.review = request.postDataJSON();
        current = detail("closable", "3");
        return reply(route, envelope({ statementSession: current, mutation: {} }));
      }
      if (request.method() === "POST" && path.endsWith("/session-aug/close")) {
        bodies.close = request.postDataJSON();
        current = detail("closed", "4");
        return reply(route, envelope({ statementSession: current, mutation: {} }));
      }
      return reply(route, { error: { message: path } }, 404);
    },
  );
  return { bodies, requested };
}

test("@desktop creates a session and keeps filters in URL", async ({ page }) => {
  const api = await installApi(page);
  await page.goto("http://localhost:3000/banking/statements");
  await expect(page.getByRole("link", { name: "2026-08-01 → 2026-08-31" })).toBeVisible();
  await page.getByRole("button", { name: "Bộ lọc" }).click();
  const sheet = page.getByRole("dialog", { name: "Bộ lọc kỳ sao kê" });
  await sheet.getByLabel("Account ID").fill("bank-vcb");
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
  await dialog.getByLabel("Lý do").fill("Monthly control");
  await dialog.getByRole("button", { name: "Tạo session" }).click();
  expect(api.bodies.create).toMatchObject({
    schemaVersion: 1,
    importIds: ["import-aug"],
    reason: "Monthly control",
  });
});

test("@desktop resolves blockers, reviews and closes in sequence", async ({ page }) => {
  const api = await installApi(page);
  await page.goto("http://localhost:3000/banking/statements/session-aug");
  await expect(page.getByText(/Blockers: TRANSACTION_COVERAGE_INCOMPLETE/)).toBeVisible();
  await page.getByRole("button", { name: "Duyệt" }).click();
  const exception = page.getByRole("dialog", { name: "Duyệt exception" });
  await exception.getByLabel("Lý do audit").fill("Verified suspense");
  await exception.getByRole("button", { name: "Xác nhận" }).click();
  expect(api.bodies.exception).toMatchObject({
    expectedResourceVersion: "1",
    reason: "Verified suspense",
  });
  await page.getByRole("button", { name: "Review session" }).click();
  const review = page.getByRole("dialog", { name: "Review kỳ sao kê" });
  await review.getByLabel("Lý do review").fill("Reviewed controls");
  await review.getByRole("button", { name: "Xác nhận review" }).click();
  expect(api.bodies.review).toMatchObject({
    expectedResourceVersion: "2",
    reason: "Reviewed controls",
  });
  await expect(page.getByText("Sẵn sàng đóng kỳ")).toBeVisible();
  await page.getByRole("button", { name: "Đóng kỳ sao kê" }).click();
  const close = page.getByRole("alertdialog", { name: "Đóng kỳ sao kê?" });
  await close.getByLabel("Lý do đóng kỳ").fill("All gates passed");
  await close.getByRole("button", { name: "Xác nhận đóng kỳ" }).click();
  expect(api.bodies.close).toMatchObject({
    expectedResourceVersion: "3",
    reason: "All gates passed",
  });
});

test("@mobile queue and detail avoid body overflow", async ({ page }) => {
  await installApi(page);
  for (const path of ["/banking/statements", "/banking/statements/session-aug"]) {
    await page.goto(`http://localhost:3000${path}`);
    await page.waitForLoadState("networkidle");
    const size = await page.evaluate(() => ({
      body: document.body.scrollWidth,
      viewport: innerWidth,
    }));
    expect(size.body).toBeLessThanOrEqual(size.viewport + 1);
  }
});
