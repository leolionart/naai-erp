export const FILTERED_DOCUMENT_EXPORT_CONTRACT_VERSION = 1 as const;
export type FilteredDocumentExportKindContract =
  "sales_invoices" | "purchase_invoices_and_expenses";
export type InvoicePresenceFilterContract = "all" | "present" | "missing";
export type FilteredDocumentExportQueryContract = Readonly<{
  startsOn: string;
  endsOn: string;
  format: "xlsx";
  state?: string;
  partyId?: string;
  payeePartyId?: string;
  projectId?: string;
  invoicePresence?: InvoicePresenceFilterContract;
}>;
export type FilteredDocumentExportSheetContract = Readonly<{
  key: "summary" | "records" | "lines" | "filters";
  name: string;
  rowCount: number;
  sha256: string;
}>;
export type FilteredDocumentExportContract = Readonly<{
  schemaVersion: typeof FILTERED_DOCUMENT_EXPORT_CONTRACT_VERSION;
  exportKind: FilteredDocumentExportKindContract;
  organizationId: string;
  generatedAt: string;
  generatedBy: string;
  filters: FilteredDocumentExportQueryContract;
  currency: string;
  recordCount: number;
  netMinor: string;
  taxMinor: string;
  grossMinor: string;
  contentSha256: string;
  filename: string;
  mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  sheets: readonly FilteredDocumentExportSheetContract[];
}>;
