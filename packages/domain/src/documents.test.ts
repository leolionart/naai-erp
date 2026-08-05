import { describe, expect, it } from "vitest";
import {
  createCreditNote,
  createPurchaseInvoice,
  createSalesInvoice,
  generateCreditNoteJournalDraft,
  generatePurchaseInvoiceJournalDraft,
  generateSalesInvoiceJournalDraft,
  recordSalesInvoicePayment,
  transitionPurchaseInvoice,
  transitionSalesInvoice,
} from "./documents.js";
import { journalTotals } from "./journal.js";

function sales() {
  return createSalesInvoice({
    organizationId: "org-naai",
    id: "sales-1",
    invoiceNumber: "AA/26E-0001",
    invoiceDate: "2026-08-05",
    customerId: "client-1",
    currency: "VND",
    paymentTerms: { dueDays: 30 },
    lines: [
      {
        id: "design",
        description: "Design service",
        netMinor: 100_000_000n,
        taxMinor: 10_000_000n,
        taxCode: "VAT10",
        postingAccountId: "service-revenue",
        allocations: [
          { amountMinor: 60_000_000n, dimensions: { projectId: "p1", clientId: "client-1" } },
          { amountMinor: 40_000_000n, dimensions: { projectId: "p2", clientId: "client-1" } },
        ],
      },
    ],
  });
}

function purchase() {
  return createPurchaseInvoice({
    organizationId: "org-naai",
    id: "purchase-1",
    invoiceNumber: "PUR-001",
    supplierInvoiceReference: "SUP-999",
    invoiceDate: "2026-08-05",
    supplierId: "supplier-1",
    evidenceHash: "sha256:abc",
    currency: "VND",
    paymentTerms: { dueDays: 15 },
    lines: [
      {
        id: "hosting",
        description: "Hosting",
        netMinor: 1_000_000n,
        taxMinor: 100_000n,
        postingAccountId: "hosting-expense",
        dimensions: { projectId: "p1" },
      },
    ],
  });
}

describe("ERP-300 invoice documents", () => {
  it("calculates exact totals, payment terms and line allocations", () => {
    const invoice = sales();
    expect(invoice).toMatchObject({
      netMinor: 100_000_000n,
      taxMinor: 10_000_000n,
      totalMinor: 110_000_000n,
      dueOn: "2026-09-04",
    });
    expect(Object.isFrozen(invoice.lines[0]!.allocations)).toBe(true);
    expect(() =>
      createSalesInvoice({
        ...invoice,
        organizationId: invoice.organizationId,
        currency: invoice.currency,
        paymentTerms: invoice.paymentTerms,
        lines: [
          {
            id: "bad",
            description: "Bad split",
            netMinor: 100n,
            postingAccountId: "revenue",
            allocations: [{ amountMinor: 99n, dimensions: {} }],
          },
        ],
      }),
    ).toThrow("allocations must total");
  });

  it("enforces sales lifecycle and issued immutability with payments", () => {
    const draft = sales();
    expect(() => transitionSalesInvoice(draft, "issued")).toThrow(
      "Invalid sales invoice transition",
    );
    const issued = transitionSalesInvoice(transitionSalesInvoice(draft, "validated"), "issued");
    expect(Object.isFrozen(issued)).toBe(true);
    const partial = recordSalesInvoicePayment(issued, 10_000_000n);
    expect(partial.state).toBe("partially_paid");
    expect(recordSalesInvoicePayment(partial, 100_000_000n).state).toBe("paid");
  });

  it("keeps capture separate from verification and enforces purchase lifecycle", () => {
    const draft = purchase();
    const captured = transitionPurchaseInvoice(draft, "captured");
    expect(captured.state).toBe("captured");
    expect(() => transitionPurchaseInvoice(captured, "approved")).toThrow("Invalid purchase");
    const verified = transitionPurchaseInvoice(captured, "verified");
    const approved = transitionPurchaseInvoice(verified, "approved");
    expect(transitionPurchaseInvoice(approved, "posted").state).toBe("posted");
  });

  it("generates deterministic balanced AR journal drafts with allocation dimensions", () => {
    const issued = transitionSalesInvoice(transitionSalesInvoice(sales(), "validated"), "issued");
    const journal = generateSalesInvoiceJournalDraft(issued, {
      journalId: "journal-sales",
      receivableAccountId: "ar",
      vatOutputAccountId: "vat-output",
    });
    expect(journalTotals(journal)).toEqual({ debitMinor: 110_000_000n, creditMinor: 110_000_000n });
    expect(journal.lines.map((line) => line.id)).toEqual([
      "receivable",
      "design-1-credit",
      "design-2-credit",
      "design-1-tax-credit",
      "design-2-tax-credit",
    ]);
    expect(journal.lines[1]!.dimensions.projectId).toBe("p1");
    expect(journal.lines[3]).toMatchObject({
      creditMinor: 6_000_000n,
      dimensions: { projectId: "p1" },
    });
  });

  it("generates deterministic balanced AP journal drafts only after approval", () => {
    const draft = purchase();
    expect(() =>
      generatePurchaseInvoiceJournalDraft(draft, {
        journalId: "journal-purchase",
        payableAccountId: "ap",
        vatInputAccountId: "vat-input",
      }),
    ).toThrow("must be approved");
    const approved = transitionPurchaseInvoice(
      transitionPurchaseInvoice(transitionPurchaseInvoice(draft, "captured"), "verified"),
      "approved",
    );
    const journal = generatePurchaseInvoiceJournalDraft(approved, {
      journalId: "journal-purchase",
      payableAccountId: "ap",
      vatInputAccountId: "vat-input",
    });
    expect(journalTotals(journal)).toEqual({ debitMinor: 1_100_000n, creditMinor: 1_100_000n });
  });

  it("creates linked bounded credit notes and inverse balanced journals", () => {
    const issued = transitionSalesInvoice(transitionSalesInvoice(sales(), "validated"), "issued");
    const credit = createCreditNote({
      id: "credit-1",
      original: issued,
      reason: "Scope reduction",
      issuedOn: "2026-08-06",
      lines: [{ originalLineId: "design", netMinor: 20_000_000n, taxMinor: 2_000_000n }],
    });
    expect(credit).toMatchObject({ originalInvoiceId: "sales-1", totalMinor: 22_000_000n });
    const journal = generateCreditNoteJournalDraft(credit, issued, {
      journalId: "journal-credit",
      receivableOrPayableAccountId: "ar",
      vatAccountId: "vat-output",
    });
    expect(journalTotals(journal)).toEqual({ debitMinor: 22_000_000n, creditMinor: 22_000_000n });
    expect(() =>
      createCreditNote({
        id: "credit-too-much",
        original: issued,
        reason: "Invalid",
        issuedOn: "2026-08-06",
        existingCreditMinorByLine: { design: 100_000_000n },
        lines: [{ originalLineId: "design", netMinor: 10_000_001n }],
      }),
    ).toThrow("Cumulative credit exceeds");
    expect(() =>
      createCreditNote({
        id: "credit-duplicate-lines",
        original: issued,
        reason: "Invalid cumulative lines",
        issuedOn: "2026-08-06",
        lines: [
          { originalLineId: "design", netMinor: 60_000_000n },
          { originalLineId: "design", netMinor: 50_000_001n },
        ],
      }),
    ).toThrow("Cumulative credit exceeds");
  });
});
