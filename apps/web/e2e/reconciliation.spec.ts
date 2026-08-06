import { expect, test, type Page, type Route } from "@playwright/test";

type JsonRow = Record<string, unknown>;

function envelope(data: unknown) {
  return { apiVersion: "v1", requestId: "e2e-request", organizationId: "naai", data };
}

async function json(route: Route, data: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
}

async function installReconciliationApi(page: Page) {
  let transactionState = "suggested";
  let reconciliation: JsonRow | undefined;
  let matchBody: JsonRow | undefined;

  await page.route("http://localhost:3001/api/v1/organizations/naai/banking/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === "GET" && path.endsWith("/transactions/tx-e2e/candidates")) {
      return json(
        route,
        envelope({
          id: "candidate-run-1",
          algorithmVersion: 1,
          thresholdBps: 8500,
          ambiguityMarginBps: 500,
          items: [
            {
              id: "candidate-1",
              rank: 1,
              targetType: "commercial_document",
              targetId: "invoice-e2e",
              currency: "VND",
              outstandingMinor: "900000",
              confidenceBps: 9200,
              factors: {
                amountBps: 3000,
                dateBps: 1500,
                referenceBps: 1800,
                partyBps: 1200,
                currencyBps: 900,
                outstandingBps: 800,
                daysApart: 1,
              },
              status: "open",
            },
          ],
        }),
      );
    }
    if (method === "GET" && path.endsWith("/transactions/tx-e2e")) {
      return json(
        route,
        envelope({
          id: "tx-e2e",
          state: transactionState,
          bookingDate: "2026-08-05",
          amountMinor: "1000000",
          currency: "VND",
          sourceKey: "provider:E2E-1",
          resourceVersion: "tx-v1",
        }),
      );
    }
    if (method === "GET" && path.endsWith("/banking/reconciliations")) {
      return json(route, envelope({ items: reconciliation ? [reconciliation] : [] }));
    }
    if (method === "GET" && path.endsWith("/banking/reconciliations/rec-e2e")) {
      return json(route, envelope(reconciliation));
    }
    if (method === "POST" && path.endsWith("/transactions/tx-e2e/match")) {
      matchBody = request.postDataJSON() as JsonRow;
      transactionState = "matched";
      reconciliation = {
        id: "rec-e2e",
        bankTransactionId: "tx-e2e",
        direction: "receipt",
        statementAmountMinor: "1000000",
        statementCurrency: "VND",
        state: "matched",
        currentAttemptNumber: 1,
        attempts: [
          {
            attemptNumber: 1,
            state: "matched",
            policyVersion: 1,
            candidateGeneration: 1,
            bankBaseAmountMinor: "1000000",
            allocations: (matchBody.allocations as unknown[]) ?? [],
            adjustments: [],
          },
        ],
        resourceVersion: "rec-v1",
        nextActions: ["reconcile"],
        drilldown: {
          bankTransactionId: "tx-e2e",
          sourceDocumentIds: ["invoice-e2e"],
          evidenceIds: ["evidence-e2e"],
        },
      };
      return json(
        route,
        envelope({ reconciliation, mutation: { auditEventId: "audit-match" } }),
        201,
      );
    }
    if (method === "POST" && path.endsWith("/transactions/tx-e2e/reconcile")) {
      transactionState = "reconciled";
      reconciliation = {
        ...reconciliation,
        state: "reconciled",
        resourceVersion: "rec-v2",
        nextActions: ["unreconcile"],
        attempts: [
          {
            ...((reconciliation?.attempts as JsonRow[])[0] ?? {}),
            state: "reconciled",
            journalId: "journal-e2e",
            reconciledReason: "Đã kiểm tra sao kê",
          },
        ],
        drilldown: {
          ...((reconciliation?.drilldown as JsonRow | undefined) ?? {}),
          journalId: "journal-e2e",
        },
      };
      return json(
        route,
        envelope({ reconciliation, mutation: { auditEventId: "audit-reconcile" } }),
        201,
      );
    }
    return json(route, { error: { code: "E2E_UNHANDLED", message: `${method} ${path}` } }, 404);
  });

  return { matchBody: () => matchBody };
}

test("@desktop reviews explainable candidates, matches a partial allocation and locks after reconcile", async ({
  page,
}) => {
  const api = await installReconciliationApi(page);
  await page.goto("http://localhost:3000/banking/reconciliation/tx-e2e");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Tải chi tiết" }).click();
  await expect(page.getByText("invoice-e2e", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("amountBps: 3000", { exact: true })).toBeVisible();
  await expect(page.getByText("92.00%", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Chọn", exact: true }).click();
  await page.getByLabel("Bank base amount").fill("1000000");
  await page.getByLabel("Target amount").fill("900000");
  await page.locator("#candidate-1-base").fill("900000");
  await page.getByRole("button", { name: "Match và tải readback" }).click();
  await expect(page.getByText(/Đã match vào reconciliation rec-e2e/)).toBeVisible();
  expect(api.matchBody()).toMatchObject({
    schemaVersion: 1,
    baseAmountMinor: "1000000",
    allocations: [
      {
        targetType: "commercial_document",
        targetId: "invoice-e2e",
        targetAmountMinor: "900000",
        targetCurrency: "VND",
        baseAmountMinor: "900000",
      },
    ],
  });

  await page.getByRole("button", { name: "Đối soát", exact: true }).click();
  await page.getByLabel("Lý do audit").fill("Đã kiểm tra sao kê");
  await page.getByRole("dialog").getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.getByText("Reconciliation đã khóa")).toBeVisible();
  await expect(page.getByRole("link", { name: /Mở journal journal-e2e/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Evidence evidence-e2e" })).toBeVisible();
});

test("@mobile reconciliation detail keeps headings and actions within the viewport", async ({
  page,
}) => {
  await page.goto("http://localhost:3000/banking/reconciliation/tx-mobile");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Đối soát giao dịch" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tải chi tiết" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
