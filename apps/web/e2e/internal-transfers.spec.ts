import { expect, test, type Page, type Route } from "@playwright/test";

type JsonRow = Record<string, unknown>;

function envelope(data: unknown) {
  return { apiVersion: "v1", requestId: "erp420-e2e", organizationId: "naai", data };
}

async function reply(route: Route, data: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
}

function attempt(state: string, destination = false, reversals: string[] = []) {
  return {
    attemptNumber: 1,
    state,
    postingMode: "transit",
    transitAccountId: "1388-TRANSIT",
    source: {
      role: "source",
      transactionId: "bank-out-1",
      financialAccountId: "bank-a",
      ledgerAccountId: "112-A",
      statementAmountMinor: "10100000",
      principalAmountMinor: "10000000",
      baseAmountMinor: "10000000",
      currency: "VND",
      bookingDate: "2026-08-05",
      journalId: "journal-out",
    },
    ...(destination
      ? {
          destination: {
            role: "destination",
            transactionId: "bank-in-1",
            financialAccountId: "bank-b",
            ledgerAccountId: "112-B",
            statementAmountMinor: "10000000",
            principalAmountMinor: "10000000",
            baseAmountMinor: "10000000",
            currency: "VND",
            bookingDate: "2026-08-06",
            journalId: "journal-in",
          },
        }
      : {}),
    fee: {
      mode: "embedded",
      amountMinor: "100000",
      baseAmountMinor: "100000",
      expenseAccountId: "642-FEE",
      reason: "Bank fee",
      journalId: "journal-fee",
    },
    journalIds: destination ? ["journal-out", "journal-in", "journal-fee"] : ["journal-out"],
    reversalJournalIds: reversals,
  };
}

function transfer(state = "pending_counterpart", destination = false, version = "1") {
  return {
    id: "transfer-e2e",
    principalAmountMinor: "10000000",
    basePrincipalAmountMinor: "10000000",
    currency: "VND",
    state,
    currentAttemptNumber: 1,
    attempts: [
      attempt(state, destination, state === "unmatched" ? ["reverse-out", "reverse-in"] : []),
    ],
    transitOutstandingMinor: state === "pending_counterpart" ? "10000000" : "0",
    resourceVersion: version,
    nextActions: state === "pending_counterpart" ? ["candidates", "match", "unmatch"] : ["unmatch"],
  };
}

async function installApi(page: Page) {
  let current = transfer();
  let createBody: JsonRow | undefined;
  let matchBody: JsonRow | undefined;
  let unmatchBody: JsonRow | undefined;
  let candidatePath = "";

  await page.route("http://localhost:3001/api/v1/organizations/naai/banking/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (method === "GET" && path.endsWith("/internal-transfers")) {
      return reply(route, envelope({ items: [current] }));
    }
    if (method === "POST" && path.endsWith("/internal-transfers")) {
      createBody = request.postDataJSON() as JsonRow;
      return reply(route, envelope({ transfer: current, mutation: { resourceVersion: "1" } }), 201);
    }
    if (method === "GET" && path.endsWith("/transactions/bank-out-1/transfer-candidates")) {
      candidatePath = path;
      return reply(
        route,
        envelope({
          transactionId: "bank-out-1",
          policyVersion: 1,
          thresholdBps: 8500,
          outcome: "unique",
          selectedTransactionId: "bank-in-1",
          items: [
            {
              transactionId: "bank-in-1",
              financialAccountId: "bank-b",
              bookingDate: "2026-08-06",
              currency: "VND",
              amountMinor: "10000000",
              eligible: true,
              confidenceBps: 9600,
              factors: {
                amountBps: 4000,
                dateBps: 1600,
                referenceBps: 1600,
                currencyBps: 1200,
                ownAccountBps: 1200,
              },
              reasons: ["different_owned_account", "opposite_direction"],
            },
          ],
        }),
      );
    }
    if (method === "GET" && path.endsWith("/transfer-e2e")) {
      return reply(route, envelope(current));
    }
    if (method === "POST" && path.endsWith("/transfer-e2e/match")) {
      matchBody = request.postDataJSON() as JsonRow;
      current = transfer("matched", true, "2");
      return reply(route, envelope({ transfer: current, mutation: { resourceVersion: "2" } }), 201);
    }
    if (method === "POST" && path.endsWith("/transfer-e2e/unmatch")) {
      unmatchBody = request.postDataJSON() as JsonRow;
      current = transfer("unmatched", true, "3");
      return reply(route, envelope({ transfer: current, mutation: { resourceVersion: "3" } }), 201);
    }
    return reply(route, { error: { code: "E2E_UNHANDLED", message: `${method} ${path}` } }, 404);
  });
  return {
    createBody: () => createBody,
    matchBody: () => matchBody,
    unmatchBody: () => unmatchBody,
    candidatePath: () => candidatePath,
  };
}

test("@desktop creates a pending transit transfer with a separately declared fee", async ({
  page,
}) => {
  const api = await installApi(page);
  await page.goto("http://localhost:3000/banking/internal-transfers");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Tạo transfer" }).click();
  await page.getByLabel("Source transaction ID").fill("bank-out-1");
  await page.getByLabel("Principal amount").fill("10000000");
  await page.getByLabel("Base principal").fill("10000000");
  await page.getByLabel("Transit account ID").fill("1388-TRANSIT");
  await page.getByLabel("Lý do").fill("Own-account transfer");
  await page.getByLabel("Fee amount (optional)").fill("100000");
  await page.getByLabel("Fee mode").click();
  await page.getByRole("option", { name: "Giao dịch fee riêng" }).click();
  await page.getByLabel("Fee transaction ID").fill("bank-fee-1");
  await page.getByLabel("Fee base amount").fill("100000");
  await page.getByLabel("Fee expense account ID").fill("642-FEE");
  await page.getByLabel("Fee reason").fill("Bank fee");
  await page.getByRole("button", { name: "Tạo pending transfer" }).click();
  await expect(page.getByText(/Đã tạo transfer pending/)).toBeVisible();
  expect(api.createBody()).toMatchObject({
    schemaVersion: 1,
    sourceTransactionId: "bank-out-1",
    principalAmountMinor: "10000000",
    transitAccountId: "1388-TRANSIT",
    fee: {
      mode: "separate_transaction",
      amountMinor: "100000",
      expenseAccountId: "642-FEE",
      transactionId: "bank-fee-1",
    },
  });
});

test("@desktop reviews candidates in a Sheet, pairs in a short Dialog and unmatches with a reasoned AlertDialog", async ({
  page,
}) => {
  const api = await installApi(page);
  await page.goto("http://localhost:3000/banking/internal-transfers/transfer-e2e");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Tải chi tiết" }).click();
  await expect
    .poll(api.candidatePath)
    .toContain("/banking/transactions/bank-out-1/transfer-candidates");
  await expect(page.getByText("Chờ đối ứng qua transit")).toBeVisible();
  await expect(page.getByText("100.000 ₫", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Tìm đối ứng" }).click();
  const candidateSheet = page.getByRole("dialog", { name: "Candidate giao dịch đối ứng" });
  await expect(candidateSheet.getByText("96.00%", { exact: true })).toBeVisible();
  await expect(candidateSheet.getByText("ownAccountBps: 1200", { exact: true })).toBeVisible();
  await candidateSheet.getByRole("button", { name: "Ghép cặp" }).click();
  const pairDialog = page.getByRole("dialog", { name: "Ghép cặp transfer" });
  await pairDialog.getByLabel("Lý do ghép").fill("Hai tài khoản đều thuộc công ty");
  await pairDialog.getByRole("button", { name: "Xác nhận ghép" }).click();
  await expect(page.getByRole("button", { name: "Hủy ghép" })).toBeVisible();
  expect(api.matchBody()).toMatchObject({
    schemaVersion: 1,
    counterpartTransactionId: "bank-in-1",
    expectedResourceVersion: "1",
    reason: "Hai tài khoản đều thuộc công ty",
  });

  await page.getByRole("button", { name: "Hủy ghép" }).click();
  const unmatchDialog = page.getByRole("alertdialog", { name: "Hủy ghép transfer?" });
  await unmatchDialog.getByLabel("Lý do audit").fill("Sai cặp sao kê");
  await unmatchDialog.getByRole("button", { name: "Xác nhận hủy ghép" }).click();
  await expect(page.getByText("Đã hủy ghép có audit")).toBeVisible();
  expect(api.unmatchBody()).toMatchObject({
    schemaVersion: 1,
    expectedResourceVersion: "2",
    reason: "Sai cặp sao kê",
  });
});

test("@mobile transfer list and detail keep primary actions within the viewport", async ({
  page,
}) => {
  await page.goto("http://localhost:3000/banking/internal-transfers");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Chuyển tiền nội bộ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tạo transfer" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.goto("http://localhost:3000/banking/internal-transfers/transfer-mobile");
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("heading", { level: 1, name: "Chi tiết chuyển nội bộ" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
