import type { JournalActorContext } from "../journals/journal.types.js";

export type CommercialDocumentType = "sales_invoice" | "purchase_invoice" | "credit_note";
export type CommercialDocumentAction =
  "capture" | "validate" | "verify" | "approve" | "issue" | "post" | "cancel";

export type DocumentAllocationInput = Readonly<{
  id: string;
  amountMinor: string;
  dimensions: Readonly<Record<string, string>>;
}>;

export type CommercialDocumentLineInput = Readonly<{
  originalLineNumber?: number;
  description: string;
  quantity: string;
  unitPriceMinor: string;
  netMinor: string;
  taxMinor: string;
  grossMinor: string;
  primaryAccountCode: string;
  taxAccountCode?: string;
  taxCode?: string;
  dimensions?: Readonly<Record<string, string>>;
  allocations: readonly DocumentAllocationInput[];
}>;

export type ExternalReferenceInput = Readonly<{
  system: string;
  externalId: string;
  canonicalUrl?: string;
  checksum?: string;
  version?: string;
  syncedAt?: string;
  metadata?: Readonly<Record<string, unknown>>;
}>;

export type CreateCommercialDocumentInput = Readonly<{
  id?: string;
  type: CommercialDocumentType;
  documentNumber: string;
  series?: string;
  fiscalYear: number;
  partyId: string;
  documentDate: string;
  dueDate: string;
  currency: string;
  netMinor: string;
  taxMinor: string;
  grossMinor: string;
  controlAccountCode: string;
  fundingSource?: Readonly<{ type: "financial_account"; financialAccountId: string }>;
  originalDocumentId?: string;
  migrationSourceExpenseId?: string;
  migrationSourceExpenseDate?: string;
  reason?: string;
  lines: readonly CommercialDocumentLineInput[];
  externalReference?: ExternalReferenceInput;
}>;

export type UpdateCommercialDocumentInput = Partial<CreateCommercialDocumentInput>;
export type CommercialDocumentCategoryInput = Readonly<{
  category: string;
}>;

export type QuickPurchaseInvoiceInput = Readonly<{
  schemaVersion?: 1;
  supplierTaxId: string;
  supplierName?: string;
  supplierLegalName?: string;
  documentNumber: string;
  series?: string;
  documentDate: string;
  dueDate?: string;
  category?: string;
  description: string;
  grossMinor: string;
  currency?: string;
  externalReference?: ExternalReferenceInput;
}>;

export type CommercialDocumentContext = JournalActorContext;
