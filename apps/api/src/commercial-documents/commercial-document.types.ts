import type { JournalActorContext } from "../journals/journal.types.js";
import type { FundingInputContract } from "@naai-erp/contracts";
import type { BusinessCorrectionRequestContract } from "@naai-erp/contracts";

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
  categoryCode?: string;
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
  /** Canonical funding contract. fundingSource is retained as a legacy alias. */
  funding?: FundingInputContract;
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
export type CommercialDocumentMetadataInput = Readonly<{
  partyId?: string | null;
  projectId?: string | null;
  category?: string | null;
  description?: string;
  reason?: string;
}>;

export type CommercialDocumentFundingReclassificationInput = Readonly<{
  targetControlAccountCode: string;
  reason: string;
}>;
export type CommercialDocumentTaxReviewInput = Readonly<{
  axis: "cit" | "vat";
  lineNumber: number;
  state: "eligible" | "partially_eligible" | "ineligible" | "accountant_override";
  eligibleMinor?: string;
  /** Approved VAT code to attach while reviewing the VAT axis. */
  taxCode?: string;
  reason: string;
  reference?: string;
}>;
/**
 * Resolve a missing/unapproved VAT code on an existing posted document line.
 * This is metadata correction only: it never rewrites the posted journal.
 */
export type CommercialDocumentTaxCodeCorrectionInput = Readonly<{
  lineNumber: number;
  reason: string;
  /** Optional explicit approved VAT code. When omitted, backend resolves by rate. */
  taxCode?: string;
}>;
export type CommercialDocumentCorrectionInput = BusinessCorrectionRequestContract;

export type QuickPurchaseInvoiceInput = Readonly<{
  schemaVersion?: 1;
  supplierTaxId?: string;
  supplierName?: string;
  supplierLegalName?: string;
  documentNumber: string;
  series?: string;
  documentDate: string;
  dueDate?: string;
  category?: string;
  description: string;
  /**
   * Optional tax-aware totals. When omitted the quick path keeps its legacy
   * gross-only behaviour (net = gross, VAT = 0). When supplied, net and tax
   * are retained verbatim and must reconcile to gross.
   */
  netMinor?: string;
  taxMinor?: string;
  taxAccountCode?: string;
  taxCode?: string;
  vatState?:
    "unreviewed" | "eligible" | "partially_eligible" | "ineligible" | "accountant_override";
  vatEligibleMinor?: string;
  grossMinor: string;
  currency?: string;
  externalReference?: ExternalReferenceInput;
  funding?: FundingInputContract;
}>;

export type QuickSalesInvoiceInput = Readonly<{
  schemaVersion?: 1;
  customerTaxId?: string;
  customerName: string;
  documentNumber: string;
  series?: string;
  documentDate: string;
  dueDate?: string;
  category?: string;
  project?: string;
  description: string;
  grossMinor: string;
  currency?: string;
  externalReference?: ExternalReferenceInput;
}>;

export type CommercialDocumentContext = JournalActorContext;
