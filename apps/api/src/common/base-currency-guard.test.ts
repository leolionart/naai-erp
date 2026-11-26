import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ArgumentsHost } from "@nestjs/common";
import { ApiExceptionFilter } from "../api-exception.filter.js";
import { CommercialDocumentService } from "../commercial-documents/commercial-document.service.js";
import { QuickPurchaseInvoiceService } from "../commercial-documents/quick-purchase-invoice.service.js";
import { QuickSalesInvoiceService } from "../commercial-documents/quick-sales-invoice.service.js";
import { ExpenseService } from "../expenses/expense.service.js";
import { InboundWebhookService } from "../inbound-webhooks/inbound-webhook.service.js";
import { JournalService } from "../journals/journal.service.js";

const context = {
  organizationId: "org-vnd",
  actorId: "owner-1",
  roles: ["owner", "finance_admin"],
  correlationId: "corr-cur-002",
} as const;

describe("ERP-985 base-currency enforcement (unit)", () => {
  it("maps FOREIGN_CURRENCY_NOT_SUPPORTED to HTTP 422 with clear VND conversion guidance", async () => {
    const { foreignCurrencyNotSupportedError } = await import("./base-currency-guard.js");
    const filter = new ApiExceptionFilter();
    let statusCode = 0;
    let payload: unknown;
    const reply = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      send(body: unknown) {
        payload = body;
        return this;
      },
    };
    const host = {
      switchToHttp: () => ({ getResponse: () => reply }),
    } as unknown as ArgumentsHost;

    filter.catch(foreignCurrencyNotSupportedError("VND", "USD"), host);

    expect(statusCode).toBe(422);
    expect(payload).toMatchObject({
      apiVersion: "v1",
      error: {
        code: "FOREIGN_CURRENCY_NOT_SUPPORTED",
        retryable: false,
        details: {
          baseCurrency: "VND",
          receivedCurrency: "USD",
        },
      },
    });
    const body = payload as { error: { message: string; details: { guidance: string } } };
    expect(body.error.message).toContain("quy đổi sang VND trước khi nhập, ghi tỷ giá vào mô tả");
    expect(body.error.details.guidance).toContain(
      "quy đổi sang VND trước khi nhập, ghi tỷ giá vào mô tả",
    );
  });

  it("rejects non-base-currency commercial documents and quick ingestion before any store write", async () => {
    const docStore = {
      validateRelationships: vi.fn().mockResolvedValue(undefined),
      create: vi.fn(),
      get: vi.fn().mockResolvedValue({ id: "doc-usd", currency: "USD", state: "validated" }),
      transition: vi.fn(),
    };
    const masterData = {
      getBaseCurrency: vi.fn().mockResolvedValue("VND"),
      export: vi.fn().mockResolvedValue({ data: [] }),
      mutate: vi.fn(),
    };
    const docService = new CommercialDocumentService(docStore as never, masterData as never);
    await expect(
      docService.create(
        context,
        {
          type: "sales_invoice",
          documentNumber: "SI-USD-1",
          fiscalYear: 2026,
          partyId: "client-1",
          documentDate: "2026-08-10",
          dueDate: "2026-08-20",
          currency: "USD",
          netMinor: "10000",
          taxMinor: "0",
          grossMinor: "10000",
          controlAccountCode: "131",
          lines: [
            {
              description: "Foreign invoice",
              quantity: "1",
              unitPriceMinor: "10000",
              netMinor: "10000",
              taxMinor: "0",
              grossMinor: "10000",
              primaryAccountCode: "511",
              allocations: [{ id: "a1", amountMinor: "10000", dimensions: { projectId: "p1" } }],
            },
          ],
        },
        "idem-doc-usd",
      ),
    ).rejects.toThrow("FOREIGN_CURRENCY_NOT_SUPPORTED");
    expect(docStore.create).not.toHaveBeenCalled();

    await expect(
      docService.transition(context, "doc-usd", "issue", { reason: "Issue" }, "idem-issue-usd"),
    ).rejects.toThrow("FOREIGN_CURRENCY_NOT_SUPPORTED");
    expect(docStore.transition).not.toHaveBeenCalled();

    const quickPurchase = new QuickPurchaseInvoiceService(masterData as never, docService);
    await expect(
      quickPurchase.create(
        context,
        {
          supplierTaxId: "0101234567",
          supplierName: "Foreign SaaS",
          documentNumber: "PI-USD-1",
          documentDate: "2026-08-10",
          description: "Cloud hosting",
          grossMinor: "5000",
          currency: "USD",
        },
        "idem-qp-usd",
      ),
    ).rejects.toThrow("FOREIGN_CURRENCY_NOT_SUPPORTED");
    expect(masterData.mutate).not.toHaveBeenCalled();

    const quickSales = new QuickSalesInvoiceService(masterData as never, docService);
    await expect(
      quickSales.create(
        context,
        {
          customerName: "Foreign Client",
          documentNumber: "QSI-USD-1",
          documentDate: "2026-08-10",
          description: "Consulting",
          grossMinor: "15000",
          currency: "EUR",
        },
        "idem-qs-eur",
      ),
    ).rejects.toThrow("FOREIGN_CURRENCY_NOT_SUPPORTED");
    expect(masterData.mutate).not.toHaveBeenCalled();
  });

  it("rejects non-base-currency expenses and journals while allowing VND", async () => {
    const masterData = { getBaseCurrency: vi.fn().mockResolvedValue("VND") };
    const expStore = {
      validateRelationships: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({ expenseId: "exp-vnd", state: "draft" }),
      get: vi.fn().mockResolvedValue({ id: "exp-usd", currency: "USD", state: "approved" }),
      transition: vi.fn(),
    };
    const expenseService = new ExpenseService(expStore as never, masterData as never);
    const baseExpense = {
      expenseClass: "non_documented",
      expenseDate: "2026-08-10",
      businessPurpose: "Software subscription",
      currency: "USD",
      netMinor: "2000",
      vatMinor: "0",
      grossMinor: "2000",
      counterAccountCode: "111",
      lines: [
        {
          description: "SaaS",
          netMinor: "2000",
          vatMinor: "0",
          grossMinor: "2000",
          postingAccountCode: "642",
          allocations: [{ id: "a1", amountMinor: "2000", dimensions: { costCenter: "ADMIN" } }],
        },
      ],
    };
    await expect(expenseService.create(context, baseExpense, "idem-exp-usd")).rejects.toThrow(
      "FOREIGN_CURRENCY_NOT_SUPPORTED",
    );
    expect(expStore.create).not.toHaveBeenCalled();

    await expect(
      expenseService.transition(context, "exp-usd", "post", { reason: "Post" }, "idem-exp-post"),
    ).rejects.toThrow("FOREIGN_CURRENCY_NOT_SUPPORTED");
    expect(expStore.transition).not.toHaveBeenCalled();

    await expect(
      expenseService.create(context, { ...baseExpense, currency: "VND" }, "idem-exp-vnd"),
    ).resolves.toMatchObject({ data: { expenseId: "exp-vnd" } });

    const journalStore = {
      create: vi.fn().mockResolvedValue({ journalId: "j-vnd", resourceVersion: "1" }),
      get: vi.fn().mockResolvedValue({ id: "j-usd", currency: "USD", state: "approved" }),
      post: vi.fn(),
      repost: vi.fn(),
    };
    const journalService = new JournalService(journalStore as never, masterData as never);
    const journalInput = {
      journalDate: "2026-08-10",
      description: "FX journal",
      currency: "USD",
      lines: [
        { accountCode: "642", debitMinor: "1000" },
        { accountCode: "111", creditMinor: "1000" },
      ],
    };
    await expect(journalService.create(context, journalInput, "idem-j-usd")).rejects.toThrow(
      "FOREIGN_CURRENCY_NOT_SUPPORTED",
    );
    await expect(journalService.repost(context, "j-rev", journalInput, "idem-jr")).rejects.toThrow(
      "FOREIGN_CURRENCY_NOT_SUPPORTED",
    );
    await expect(journalService.post(context, "j-usd", "idem-jp")).rejects.toThrow(
      "FOREIGN_CURRENCY_NOT_SUPPORTED",
    );
    expect(journalStore.create).not.toHaveBeenCalled();
    expect(journalStore.post).not.toHaveBeenCalled();

    process.env.TEST_ERP985_SECRET = "unit-hook-secret";
    try {
      const webhookStore = {
        source: vi.fn().mockResolvedValue({
          organizationId: "org-vnd",
          id: "src-1",
          publicId: "pub-1",
          actorId: "bot-1",
          secretRef: "TEST_ERP985_SECRET",
          status: "active",
          allowedEventTypes: ["expense.create"],
          timestampToleranceSeconds: 300,
          maxAttempts: 3,
        }),
        receive: vi.fn(),
        finish: vi.fn(),
      };
      const webhookService = new InboundWebhookService(
        webhookStore as never,
        {} as never,
        {} as never,
        masterData as never,
      );
      const body = {
        schemaVersion: 1,
        eventType: "expense.create",
        externalId: "ext-usd-1",
        occurredAt: "2026-08-10T10:00:00Z",
        data: { currency: "USD" },
      };
      const raw = Buffer.from(JSON.stringify(body));
      const ts = String(Math.floor(Date.now() / 1000));
      const sig = `sha256=${createHmac("sha256", "unit-hook-secret").update(`${ts}.`).update(raw).digest("hex")}`;
      await expect(
        webhookService.receive("pub-1", raw, body, {
          timestamp: ts,
          signature: sig,
          idempotencyKey: "k-1",
          correlationId: "c-1",
        }),
      ).rejects.toThrow("FOREIGN_CURRENCY_NOT_SUPPORTED");
      expect(webhookStore.receive).not.toHaveBeenCalled();
    } finally {
      delete process.env.TEST_ERP985_SECRET;
    }
  });
});
