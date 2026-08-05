import { createDraftJournal, type JournalDimensions, type JournalEntry } from "./journal.js";
import { currencyCode, type CurrencyCode } from "./organization-setup.js";
import { organizationId, type OrganizationId } from "./organization.js";

export type DocumentAllocation = Readonly<{
  amountMinor: bigint;
  dimensions: JournalDimensions;
}>;

export type InvoiceLine = Readonly<{
  id: string;
  description: string;
  netMinor: bigint;
  taxMinor: bigint;
  taxCode?: string;
  postingAccountId: string;
  allocations: readonly DocumentAllocation[];
}>;

export type PaymentTerms = Readonly<{ dueDays: number }>;
export type SalesInvoiceState = "draft" | "validated" | "issued" | "partially_paid" | "paid";
export type PurchaseInvoiceState =
  "draft" | "captured" | "verified" | "approved" | "posted" | "partially_paid" | "paid";

type InvoiceBase = Readonly<{
  organizationId: OrganizationId;
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueOn: string;
  currency: CurrencyCode;
  paymentTerms: PaymentTerms;
  lines: readonly InvoiceLine[];
  netMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
  paidMinor: bigint;
}>;

export type SalesInvoice = InvoiceBase &
  Readonly<{ kind: "sales"; customerId: string; state: SalesInvoiceState }>;
export type PurchaseInvoice = InvoiceBase &
  Readonly<{
    kind: "purchase";
    supplierId: string;
    supplierInvoiceReference: string;
    evidenceHash?: string;
    state: PurchaseInvoiceState;
  }>;

export type CreditNote = Readonly<{
  organizationId: OrganizationId;
  id: string;
  kind: "sales" | "purchase";
  originalInvoiceId: string;
  reason: string;
  issuedOn: string;
  currency: CurrencyCode;
  lines: readonly Readonly<{
    originalLineId: string;
    netMinor: bigint;
    taxMinor: bigint;
  }>[];
  totalMinor: bigint;
}>;

function required(value: string, label: string): string {
  const result = value.trim();
  if (!result) throw new Error(`${label} is required`);
  return result;
}

function date(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} must be an ISO date`);
  }
  return value;
}

function dueDate(invoiceDate: string, terms: PaymentTerms): string {
  if (!Number.isSafeInteger(terms.dueDays) || terms.dueDays < 0) {
    throw new Error("Payment term days must be a non-negative integer");
  }
  const value = new Date(`${invoiceDate}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + terms.dueDays);
  return value.toISOString().slice(0, 10);
}

function normalizeLines(
  lines: readonly {
    id: string;
    description: string;
    netMinor: bigint;
    taxMinor?: bigint;
    taxCode?: string;
    postingAccountId: string;
    dimensions?: JournalDimensions;
    allocations?: readonly DocumentAllocation[];
  }[],
): readonly InvoiceLine[] {
  if (!lines.length) throw new Error("Invoice requires at least one line");
  const ids = new Set<string>();
  return Object.freeze(
    lines.map((line) => {
      const id = required(line.id, "Invoice line ID");
      if (ids.has(id)) throw new Error("Invoice line IDs must be unique");
      ids.add(id);
      const taxMinor = line.taxMinor ?? 0n;
      if (line.netMinor <= 0n || taxMinor < 0n) throw new Error("Invoice amounts are invalid");
      const allocations = line.allocations?.length
        ? line.allocations
        : [{ amountMinor: line.netMinor, dimensions: line.dimensions ?? {} }];
      if (allocations.some((allocation) => allocation.amountMinor <= 0n)) {
        throw new Error("Allocation amounts must be positive");
      }
      if (
        allocations.reduce((sum, allocation) => sum + allocation.amountMinor, 0n) !== line.netMinor
      ) {
        throw new Error("Line allocations must total the line net amount exactly");
      }
      return Object.freeze({
        id,
        description: required(line.description, "Invoice line description"),
        netMinor: line.netMinor,
        taxMinor,
        ...(line.taxCode?.trim() ? { taxCode: line.taxCode.trim() } : {}),
        postingAccountId: required(line.postingAccountId, "Posting account ID"),
        allocations: Object.freeze(
          allocations.map((allocation) =>
            Object.freeze({
              amountMinor: allocation.amountMinor,
              dimensions: Object.freeze({ ...allocation.dimensions }),
            }),
          ),
        ),
      });
    }),
  );
}

function totals(lines: readonly InvoiceLine[]) {
  const netMinor = lines.reduce((sum, line) => sum + line.netMinor, 0n);
  const taxMinor = lines.reduce((sum, line) => sum + line.taxMinor, 0n);
  return { netMinor, taxMinor, totalMinor: netMinor + taxMinor };
}

export function createSalesInvoice(input: {
  organizationId: string;
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerId: string;
  currency: string;
  paymentTerms: PaymentTerms;
  lines: Parameters<typeof normalizeLines>[0];
}): SalesInvoice {
  const invoiceDate = date(input.invoiceDate, "Invoice date");
  const lines = normalizeLines(input.lines);
  return Object.freeze({
    organizationId: organizationId(input.organizationId),
    id: required(input.id, "Invoice ID"),
    invoiceNumber: required(input.invoiceNumber, "Invoice number"),
    invoiceDate,
    dueOn: dueDate(invoiceDate, input.paymentTerms),
    customerId: required(input.customerId, "Customer ID"),
    currency: currencyCode(input.currency),
    paymentTerms: Object.freeze({ ...input.paymentTerms }),
    lines,
    ...totals(lines),
    paidMinor: 0n,
    kind: "sales",
    state: "draft",
  });
}

export function transitionSalesInvoice(
  invoice: SalesInvoice,
  next: SalesInvoiceState,
): SalesInvoice {
  const allowed: Record<SalesInvoiceState, readonly SalesInvoiceState[]> = {
    draft: ["validated"],
    validated: ["issued"],
    issued: ["partially_paid", "paid"],
    partially_paid: ["partially_paid", "paid"],
    paid: [],
  };
  if (!allowed[invoice.state].includes(next)) {
    throw new Error(`Invalid sales invoice transition: ${invoice.state} -> ${next}`);
  }
  return Object.freeze({ ...invoice, state: next });
}

export function recordSalesInvoicePayment(
  invoice: SalesInvoice,
  amountMinor: bigint,
): SalesInvoice {
  if (!(["issued", "partially_paid"] as const).includes(invoice.state as "issued")) {
    throw new Error("Only issued sales invoices can receive payment");
  }
  if (amountMinor <= 0n || invoice.paidMinor + amountMinor > invoice.totalMinor) {
    throw new Error("Sales invoice payment exceeds outstanding amount or is invalid");
  }
  const paidMinor = invoice.paidMinor + amountMinor;
  return Object.freeze({
    ...invoice,
    paidMinor,
    state: paidMinor === invoice.totalMinor ? "paid" : "partially_paid",
  });
}

export function createPurchaseInvoice(input: {
  organizationId: string;
  id: string;
  invoiceNumber: string;
  supplierInvoiceReference: string;
  invoiceDate: string;
  supplierId: string;
  evidenceHash?: string;
  currency: string;
  paymentTerms: PaymentTerms;
  lines: Parameters<typeof normalizeLines>[0];
}): PurchaseInvoice {
  const invoiceDate = date(input.invoiceDate, "Invoice date");
  const lines = normalizeLines(input.lines);
  return Object.freeze({
    organizationId: organizationId(input.organizationId),
    id: required(input.id, "Invoice ID"),
    invoiceNumber: required(input.invoiceNumber, "Invoice number"),
    supplierInvoiceReference: required(
      input.supplierInvoiceReference,
      "Supplier invoice reference",
    ),
    invoiceDate,
    dueOn: dueDate(invoiceDate, input.paymentTerms),
    supplierId: required(input.supplierId, "Supplier ID"),
    ...(input.evidenceHash?.trim() ? { evidenceHash: input.evidenceHash.trim() } : {}),
    currency: currencyCode(input.currency),
    paymentTerms: Object.freeze({ ...input.paymentTerms }),
    lines,
    ...totals(lines),
    paidMinor: 0n,
    kind: "purchase",
    state: "draft",
  });
}

export function transitionPurchaseInvoice(
  invoice: PurchaseInvoice,
  next: PurchaseInvoiceState,
): PurchaseInvoice {
  const allowed: Record<PurchaseInvoiceState, readonly PurchaseInvoiceState[]> = {
    draft: ["captured"],
    captured: ["verified"],
    verified: ["approved"],
    approved: ["posted"],
    posted: ["partially_paid", "paid"],
    partially_paid: ["partially_paid", "paid"],
    paid: [],
  };
  if (!allowed[invoice.state].includes(next)) {
    throw new Error(`Invalid purchase invoice transition: ${invoice.state} -> ${next}`);
  }
  return Object.freeze({ ...invoice, state: next });
}

export function recordPurchaseInvoicePayment(
  invoice: PurchaseInvoice,
  amountMinor: bigint,
): PurchaseInvoice {
  if (!(["posted", "partially_paid"] as const).includes(invoice.state as "posted")) {
    throw new Error("Only posted purchase invoices can receive payment");
  }
  if (amountMinor <= 0n || invoice.paidMinor + amountMinor > invoice.totalMinor) {
    throw new Error("Purchase invoice payment exceeds outstanding amount or is invalid");
  }
  const paidMinor = invoice.paidMinor + amountMinor;
  return Object.freeze({
    ...invoice,
    paidMinor,
    state: paidMinor === invoice.totalMinor ? "paid" : "partially_paid",
  });
}

function allocatedLines(invoice: SalesInvoice | PurchaseInvoice, side: "debit" | "credit") {
  return invoice.lines.flatMap((line) =>
    line.allocations.map((allocation, index) => ({
      id: `${line.id}-${index + 1}-${side}`,
      accountId: line.postingAccountId,
      description: line.description,
      ...(side === "debit"
        ? { debitMinor: allocation.amountMinor }
        : { creditMinor: allocation.amountMinor }),
      dimensions: allocation.dimensions,
    })),
  );
}

function allocatedTaxLines(
  invoice: SalesInvoice | PurchaseInvoice,
  accountId: string,
  side: "debit" | "credit",
) {
  return invoice.lines.flatMap((line) => {
    let allocated = 0n;
    return line.allocations.flatMap((allocation, index) => {
      const amount =
        index === line.allocations.length - 1
          ? line.taxMinor - allocated
          : (line.taxMinor * allocation.amountMinor) / line.netMinor;
      allocated += amount;
      return amount === 0n
        ? []
        : [
            {
              id: `${line.id}-${index + 1}-tax-${side}`,
              accountId,
              description: `Tax ${line.description}`,
              ...(side === "debit" ? { debitMinor: amount } : { creditMinor: amount }),
              dimensions: Object.freeze({
                ...allocation.dimensions,
                ...(line.taxCode ? { taxCode: line.taxCode } : {}),
              }),
            },
          ];
    });
  });
}

export function generateSalesInvoiceJournalDraft(
  invoice: SalesInvoice,
  input: { journalId: string; receivableAccountId: string; vatOutputAccountId: string },
): JournalEntry {
  if (!(["issued", "partially_paid", "paid"] as const).includes(invoice.state as "issued")) {
    throw new Error("Sales invoice must be issued before journal generation");
  }
  return createDraftJournal({
    organizationId: invoice.organizationId,
    id: input.journalId,
    entryDate: invoice.invoiceDate,
    baseCurrency: invoice.currency,
    description: `Sales invoice ${invoice.invoiceNumber}`,
    lines: [
      { id: "receivable", accountId: input.receivableAccountId, debitMinor: invoice.totalMinor },
      ...allocatedLines(invoice, "credit"),
      ...allocatedTaxLines(invoice, input.vatOutputAccountId, "credit"),
    ],
  });
}

export function generatePurchaseInvoiceJournalDraft(
  invoice: PurchaseInvoice,
  input: { journalId: string; payableAccountId: string; vatInputAccountId: string },
): JournalEntry {
  if (
    !(["approved", "posted", "partially_paid", "paid"] as const).includes(
      invoice.state as "approved",
    )
  ) {
    throw new Error("Purchase invoice must be approved before journal generation");
  }
  return createDraftJournal({
    organizationId: invoice.organizationId,
    id: input.journalId,
    entryDate: invoice.invoiceDate,
    baseCurrency: invoice.currency,
    description: `Purchase invoice ${invoice.invoiceNumber}`,
    lines: [
      ...allocatedLines(invoice, "debit"),
      ...allocatedTaxLines(invoice, input.vatInputAccountId, "debit"),
      { id: "payable", accountId: input.payableAccountId, creditMinor: invoice.totalMinor },
    ],
  });
}

export function createCreditNote(input: {
  id: string;
  original: SalesInvoice | PurchaseInvoice;
  reason: string;
  issuedOn: string;
  existingCreditMinorByLine?: Readonly<Record<string, bigint>>;
  existingCreditNetMinorByLine?: Readonly<Record<string, bigint>>;
  existingCreditTaxMinorByLine?: Readonly<Record<string, bigint>>;
  lines: readonly { originalLineId: string; netMinor: bigint; taxMinor?: bigint }[];
}): CreditNote {
  const allowedState =
    input.original.kind === "sales"
      ? ["issued", "partially_paid", "paid"].includes(input.original.state)
      : ["posted", "partially_paid", "paid"].includes(input.original.state);
  if (!allowedState) throw new Error("Original invoice is not eligible for a credit note");
  if (!input.lines.length) throw new Error("Credit note requires at least one line");
  const legacyCumulativeByLine = new Map<string, bigint>(
    Object.entries(input.existingCreditMinorByLine ?? {}),
  );
  const cumulativeNetByLine = new Map<string, bigint>(
    Object.entries(input.existingCreditNetMinorByLine ?? {}),
  );
  const cumulativeTaxByLine = new Map<string, bigint>(
    Object.entries(input.existingCreditTaxMinorByLine ?? {}),
  );
  const lines = input.lines.map((credit) => {
    const originalLine = input.original.lines.find((line) => line.id === credit.originalLineId);
    if (!originalLine) throw new Error("Credit note line must reference an original invoice line");
    const taxMinor = credit.taxMinor ?? 0n;
    if (credit.netMinor <= 0n || taxMinor < 0n) throw new Error("Credit note amounts are invalid");
    const cumulativeNet = (cumulativeNetByLine.get(credit.originalLineId) ?? 0n) + credit.netMinor;
    const cumulativeTax = (cumulativeTaxByLine.get(credit.originalLineId) ?? 0n) + taxMinor;
    const legacyCumulative =
      (legacyCumulativeByLine.get(credit.originalLineId) ?? 0n) + credit.netMinor + taxMinor;
    if (
      cumulativeNet > originalLine.netMinor ||
      cumulativeTax > originalLine.taxMinor ||
      legacyCumulative > originalLine.netMinor + originalLine.taxMinor
    ) {
      throw new Error("Cumulative credit exceeds original invoice line amount");
    }
    cumulativeNetByLine.set(credit.originalLineId, cumulativeNet);
    cumulativeTaxByLine.set(credit.originalLineId, cumulativeTax);
    legacyCumulativeByLine.set(credit.originalLineId, legacyCumulative);
    return Object.freeze({
      originalLineId: credit.originalLineId,
      netMinor: credit.netMinor,
      taxMinor,
    });
  });
  return Object.freeze({
    organizationId: input.original.organizationId,
    id: required(input.id, "Credit note ID"),
    kind: input.original.kind,
    originalInvoiceId: input.original.id,
    reason: required(input.reason, "Credit note reason"),
    issuedOn: date(input.issuedOn, "Credit note issue date"),
    currency: input.original.currency,
    lines: Object.freeze(lines),
    totalMinor: lines.reduce((sum, line) => sum + line.netMinor + line.taxMinor, 0n),
  });
}

export function generateCreditNoteJournalDraft(
  creditNote: CreditNote,
  original: SalesInvoice | PurchaseInvoice,
  input: {
    journalId: string;
    receivableOrPayableAccountId: string;
    vatAccountId: string;
  },
): JournalEntry {
  if (
    creditNote.originalInvoiceId !== original.id ||
    creditNote.organizationId !== original.organizationId ||
    creditNote.kind !== original.kind
  ) {
    throw new Error("Credit note and original invoice do not match");
  }
  const netLines = creditNote.lines.flatMap((credit, creditIndex) => {
    const originalLine = original.lines.find((line) => line.id === credit.originalLineId)!;
    let allocated = 0n;
    return originalLine.allocations.map((allocation, allocationIndex) => {
      const amount =
        allocationIndex === originalLine.allocations.length - 1
          ? credit.netMinor - allocated
          : (credit.netMinor * allocation.amountMinor) / originalLine.netMinor;
      allocated += amount;
      return {
        id: `credit-${creditIndex + 1}-${allocationIndex + 1}-net`,
        accountId: originalLine.postingAccountId,
        ...(creditNote.kind === "sales" ? { debitMinor: amount } : { creditMinor: amount }),
        dimensions: allocation.dimensions,
      };
    });
  });
  const taxLines = creditNote.lines.flatMap((credit, creditIndex) => {
    const originalLine = original.lines.find((line) => line.id === credit.originalLineId)!;
    let allocated = 0n;
    return originalLine.allocations.flatMap((allocation, allocationIndex) => {
      const amount =
        allocationIndex === originalLine.allocations.length - 1
          ? credit.taxMinor - allocated
          : (credit.taxMinor * allocation.amountMinor) / originalLine.netMinor;
      allocated += amount;
      return amount === 0n
        ? []
        : [
            {
              id: `credit-${creditIndex + 1}-${allocationIndex + 1}-tax`,
              accountId: input.vatAccountId,
              ...(creditNote.kind === "sales" ? { debitMinor: amount } : { creditMinor: amount }),
              dimensions: Object.freeze({
                ...allocation.dimensions,
                ...(originalLine.taxCode ? { taxCode: originalLine.taxCode } : {}),
              }),
            },
          ];
    });
  });
  return createDraftJournal({
    organizationId: creditNote.organizationId,
    id: input.journalId,
    entryDate: creditNote.issuedOn,
    baseCurrency: creditNote.currency,
    description: `Credit note ${creditNote.id} for ${original.invoiceNumber}`,
    lines: [
      ...netLines,
      ...taxLines,
      {
        id: "credit-control",
        accountId: input.receivableOrPayableAccountId,
        ...(creditNote.kind === "sales"
          ? { creditMinor: creditNote.totalMinor }
          : { debitMinor: creditNote.totalMinor }),
      },
    ],
  });
}
