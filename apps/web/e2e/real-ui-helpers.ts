import { randomInt, randomUUID } from "node:crypto";
import { expect, type Locator, type Page } from "@playwright/test";

export async function chooseSelectOption(
  triggerContainer: Locator,
  page: Page,
  optionPattern: RegExp,
) {
  await triggerContainer.getByRole("combobox").first().click();
  await page.getByRole("option", { name: optionPattern }).first().click();
}

export async function readExpenseSummary(id: string) {
  const refreshed = await apiData<JsonRecord>("GET", `/expenses/${encodeURIComponent(id)}`);
  const firstLine = Array.isArray(refreshed.lines)
    ? (refreshed.lines[0] as JsonRecord | undefined)
    : undefined;
  return {
    state: refreshed.state,
    purpose: refreshed.businessPurpose ?? refreshed.business_purpose,
    category:
      firstLine?.expenseCategoryCode ?? firstLine?.expense_category_code ?? refreshed.category,
    journalId: refreshed.journalId ?? refreshed.journal_id,
  };
}

export async function readDocumentSummary(id: string) {
  const refreshed = await apiData<JsonRecord>(
    "GET",
    `/commercial-documents/${encodeURIComponent(id)}`,
  );
  const firstLine = Array.isArray(refreshed.lines)
    ? (refreshed.lines[0] as JsonRecord | undefined)
    : undefined;
  return {
    state: refreshed.state,
    category: firstLine?.categoryCode ?? firstLine?.category_code ?? refreshed.category,
    description: firstLine?.description,
    journalId: refreshed.journalId ?? refreshed.journal_id,
  };
}

export type JsonRecord = Record<string, unknown>;

export const REAL_UI_CONFIG = {
  apiUrl: process.env.REAL_UI_API_URL ?? "http://127.0.0.1:3101",
  orgId: process.env.REAL_UI_ORG_ID ?? "org-ui",
  ownerToken: process.env.REAL_UI_OWNER_TOKEN ?? "ui-owner-token",
  intToken: process.env.REAL_UI_INT_TOKEN ?? "ui-int-token",
  year: Number(process.env.REAL_UI_YEAR ?? new Date().getFullYear()),
};

function orgBaseUrl() {
  return `${REAL_UI_CONFIG.apiUrl}/api/v1/organizations/${encodeURIComponent(REAL_UI_CONFIG.orgId)}`;
}

let uniqueSequence = 1;

export function nextTestStamp(prefix: string) {
  const seq = uniqueSequence++;
  const month = String(randomInt(1, 10)).padStart(2, "0");
  const day = String(randomInt(1, 28)).padStart(2, "0");
  const date = `${REAL_UI_CONFIG.year}-${month}-${day}`;
  const suffixCode = randomUUID().slice(0, 6).toUpperCase();
  return {
    id: `${prefix}-${seq}-${suffixCode.toLowerCase()}`,
    seq,
    suffixCode,
    date,
    netMinor: randomInt(200_000, 9_000_000),
  };
}

export async function apiRequest<T = JsonRecord>(
  method: string,
  path: string,
  options: {
    token?: string;
    body?: unknown;
    expectedVersion?: string;
    idempotencyKey?: string;
  } = {},
): Promise<{ status: number; payload: T }> {
  const token = options.token ?? REAL_UI_CONFIG.ownerToken;
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    "x-correlation-id": `real-ui-${randomUUID()}`,
  };
  if (method !== "GET") {
    headers["idempotency-key"] = options.idempotencyKey ?? randomUUID();
  }
  if (options.expectedVersion) {
    headers["if-match"] = options.expectedVersion;
  }
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  const response = await fetch(`${orgBaseUrl()}${path}`, {
    method,
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const text = await response.text();
  const payload = (text ? JSON.parse(text) : {}) as T;
  return { status: response.status, payload };
}

export async function apiData<T = JsonRecord>(
  method: string,
  path: string,
  options: {
    token?: string;
    body?: unknown;
    expectedVersion?: string;
    idempotencyKey?: string;
  } = {},
): Promise<T> {
  const { status, payload } = await apiRequest<{ data?: T; error?: unknown }>(
    method,
    path,
    options,
  );
  if (status >= 400) {
    throw new Error(`${method} ${path} failed (${status}): ${JSON.stringify(payload)}`);
  }
  return ((payload as { data?: T }).data ?? (payload as unknown as T)) as T;
}

export async function seedExpense(options: {
  asIntegrationDraft?: boolean;
  purpose: string;
  category?: string;
  vatRatePercent?: 0 | 10;
  counterAccountCode?: string;
}) {
  const stamp = nextTestStamp(options.asIntegrationDraft ? "exp-draft" : "exp-posted");
  const net = stamp.netMinor;
  const vat = options.vatRatePercent === 10 ? Math.round(net * 0.1) : 0;
  const gross = net + vat;
  const category = options.category ?? "OFFICE";
  const data = await apiData<JsonRecord>("POST", "/expenses", {
    token: options.asIntegrationDraft ? REAL_UI_CONFIG.intToken : REAL_UI_CONFIG.ownerToken,
    body: {
      id: stamp.id,
      expenseClass: "invoice_backed",
      payeePartyId: "SUP",
      expenseDate: stamp.date,
      businessPurpose: options.purpose,
      currency: "VND",
      netMinor: String(net),
      vatMinor: String(vat),
      grossMinor: String(gross),
      counterAccountCode: options.counterAccountCode ?? "3388-OWNER",
      evidenceChecklist: { invoice: true },
      externalReference: {
        system: "paperless-ngx",
        externalId: `pl-${stamp.id}`,
      },
      lines: [
        {
          description: options.purpose,
          netMinor: String(net),
          vatMinor: String(vat),
          grossMinor: String(gross),
          postingAccountCode: "642-OPEX",
          expenseCategoryCode: category,
          ...(vat > 0 ? { vatAccountCode: "1331-VAT" } : {}),
          allocations: [
            {
              id: `${stamp.id}-alloc`,
              amountMinor: String(net),
              dimensions: { costCenter: "ADMIN" },
            },
          ],
        },
      ],
    },
  });
  return { id: stamp.id, date: stamp.date, grossMinor: String(gross), record: data };
}

export async function seedIssuedSalesInvoice(options: { description: string; category?: string }) {
  const stamp = nextTestStamp("inv-sales");
  const net = stamp.netMinor;
  const tax = Math.round(net * 0.1);
  const gross = net + tax;
  const docNumber = `INV-${stamp.suffixCode}`;
  const data = await apiData<JsonRecord>("POST", "/commercial-documents", {
    token: REAL_UI_CONFIG.ownerToken,
    body: {
      id: stamp.id,
      type: "sales_invoice",
      documentNumber: docNumber,
      series: "AA",
      fiscalYear: REAL_UI_CONFIG.year,
      partyId: "CLIENT",
      documentDate: stamp.date,
      dueDate: stamp.date,
      currency: "VND",
      netMinor: String(net),
      taxMinor: String(tax),
      grossMinor: String(gross),
      controlAccountCode: "131-AR",
      lines: [
        {
          description: options.description,
          quantity: "1",
          unitPriceMinor: String(net),
          netMinor: String(net),
          taxMinor: String(tax),
          grossMinor: String(gross),
          primaryAccountCode: "511-REV",
          taxAccountCode: "3331-VAT-OUT",
          categoryCode: options.category ?? "SERVICE",
          allocations: [
            {
              id: `${stamp.id}-alloc`,
              amountMinor: String(net),
              dimensions: { projectId: "PRJ" },
            },
          ],
        },
      ],
    },
  });
  return { id: stamp.id, documentNumber: docNumber, record: data };
}

export async function seedPostedPurchaseInvoice(options: { description: string }) {
  const stamp = nextTestStamp("pur-posted");
  const net = stamp.netMinor;
  const tax = Math.round(net * 0.1);
  const gross = net + tax;
  const docNumber = `PINV-${stamp.suffixCode}`;
  const data = await apiData<JsonRecord>("POST", "/commercial-documents", {
    token: REAL_UI_CONFIG.ownerToken,
    body: {
      id: stamp.id,
      type: "purchase_invoice",
      documentNumber: docNumber,
      series: "BB",
      fiscalYear: REAL_UI_CONFIG.year,
      partyId: "SUP",
      documentDate: stamp.date,
      dueDate: stamp.date,
      currency: "VND",
      netMinor: String(net),
      taxMinor: String(tax),
      grossMinor: String(gross),
      controlAccountCode: "331-AP",
      lines: [
        {
          description: options.description,
          quantity: "1",
          unitPriceMinor: String(net),
          netMinor: String(net),
          taxMinor: String(tax),
          grossMinor: String(gross),
          primaryAccountCode: "642-OPEX",
          taxAccountCode: "1331-VAT",
          categoryCode: "OFFICE",
          allocations: [
            {
              id: `${stamp.id}-alloc`,
              amountMinor: String(net),
              dimensions: { projectId: "PRJ" },
            },
          ],
        },
      ],
    },
  });
  return { id: stamp.id, documentNumber: docNumber, record: data };
}

export async function seedIngestedDraftPurchaseInvoice(options: { description: string }) {
  const stamp = nextTestStamp("pur-draft");
  const docNumber = `OCR-${stamp.suffixCode}`;
  const result = await apiData<{ document: JsonRecord }>(
    "POST",
    "/commercial-documents/purchase-invoice-ingestion",
    {
      token: REAL_UI_CONFIG.intToken,
      body: {
        supplierTaxId: "0312345678",
        supplierName: "Nhà cung cấp B",
        documentNumber: docNumber,
        documentDate: stamp.date,
        category: "OFFICE",
        description: options.description,
        grossMinor: String(stamp.netMinor),
        externalReference: {
          system: "paperless-ngx",
          externalId: `pl-${stamp.id}`,
        },
      },
    },
  );
  const docId = String(result.document?.id ?? "");
  return { id: docId, documentNumber: docNumber, record: result.document };
}

export function attachApiFailureMonitor(page: Page) {
  const failures: string[] = [];
  const obsoletePathsCalled: string[] = [];

  page.on("request", (req) => {
    const url = req.url();
    if (/\/organizations\/[^/]+\/expense-categories(\?|$)/.test(url)) {
      obsoletePathsCalled.push(`obsolete GET expense-categories: ${url}`);
    }
    if (/\/organizations\/[^/]+\/time\/workers(\?|$)/.test(url)) {
      obsoletePathsCalled.push(`obsolete GET time/workers: ${url}`);
    }
  });

  page.on("response", async (res) => {
    if (!res.url().includes("/api/v1/") || res.status() < 400) return;
    let snippet = "";
    try {
      snippet = (await res.text()).slice(0, 240);
    } catch {
      snippet = "(body unavailable)";
    }
    failures.push(`${res.status()} ${res.request().method()} ${res.url()} :: ${snippet}`);
  });

  return {
    failures,
    obsoletePathsCalled,
    assertClean() {
      expect(obsoletePathsCalled, "UI must not call obsolete endpoints").toEqual([]);
      expect(failures, "Real API responses during UI flow must not fail").toEqual([]);
    },
  };
}

/**
 * Cleanly exercises batch draft recording against `/drafts/record` when ERP-989 is present,
 * or falls back to recording each seeded draft sequentially on the current API contract.
 */
export async function recordDraftBatchCompat(expenseIds: readonly string[]) {
  const probe = await apiRequest<{ data?: JsonRecord }>("POST", "/drafts/record", {
    body: {
      dryRun: true,
      items: expenseIds.map((id) => ({ kind: "expense", id })),
    },
  });
  if (probe.status === 200 && probe.payload?.data) {
    const planHash = String((probe.payload.data as JsonRecord).planHash ?? "");
    const committed = await apiData<JsonRecord>("POST", "/drafts/record", {
      body: {
        dryRun: false,
        commit: true,
        ...(planHash ? { planHash } : {}),
        items: expenseIds.map((id) => ({ kind: "expense", id })),
      },
    });
    return { mode: "batch_endpoint" as const, result: committed };
  }

  for (const id of expenseIds) {
    const oneClick = await apiRequest("POST", `/expenses/${encodeURIComponent(id)}/record`, {
      body: { reason: "Chủ ghi sổ lô nháp" },
    });
    if (oneClick.status === 200 || oneClick.status === 201) continue;
    for (const step of ["submit", "approve", "post"] as const) {
      await apiData("POST", `/expenses/${encodeURIComponent(id)}/${step}`, {
        body: { reason: `Chủ ghi sổ (${step})` },
      });
    }
  }
  return { mode: "sequential_compat" as const, count: expenseIds.length };
}
