import type { JournalActorContext } from "../journals/journal.types.js";
import type { FilteredDocumentExportQueryContract } from "@naai-erp/contracts";

export type ReportExportContext = JournalActorContext;
export type ReportKind =
  | "profit_and_loss"
  | "balance_sheet"
  | "direct_cash_flow"
  | "vat_reconciliation"
  | "tax_expense_review";
export type SnapshotInput = Readonly<{
  reportKind: ReportKind;
  period: { startsOn?: string; endsOn?: string; asOfDate: string };
  dimensions?: Record<string, string>;
  accountingBasis: string;
  framework?: string;
  formulaVersions: Record<string, string>;
  request: Record<string, unknown>;
}>;
export type ExportInput = Readonly<{
  snapshotId: string;
  snapshotVersion: number;
  format: "csv" | "xlsx";
  reportKind: ReportKind;
}>;
export type ReportExportStore = Readonly<{
  listSnapshots(c: ReportExportContext): Promise<unknown>;
  getSnapshot(c: ReportExportContext, id: string, version?: number): Promise<unknown>;
  createSnapshot(c: ReportExportContext, input: SnapshotInput, key: string): Promise<unknown>;
  reproduceSnapshot(c: ReportExportContext, id: string, version: number): Promise<unknown>;
  listExports(c: ReportExportContext): Promise<unknown>;
  getExport(c: ReportExportContext, id: string, version?: number): Promise<unknown>;
  createExport(c: ReportExportContext, input: ExportInput, key: string): Promise<unknown>;
  downloadExport(
    c: ReportExportContext,
    id: string,
    version: number,
  ): Promise<{ content: Buffer; mediaType: string; filename: string }>;
  supersedeExport(
    c: ReportExportContext,
    id: string,
    version: number,
    reason: string,
    key: string,
  ): Promise<unknown>;
  exportSalesInvoices(
    c: ReportExportContext,
    filters: FilteredDocumentExportQueryContract,
  ): Promise<{ content: Buffer; mediaType: string; filename: string; sha256: string }>;
  exportPurchaseInvoicesExpenses(
    c: ReportExportContext,
    filters: FilteredDocumentExportQueryContract,
  ): Promise<{ content: Buffer; mediaType: string; filename: string; sha256: string }>;
}>;
export const REPORT_EXPORT_STORE = Symbol("REPORT_EXPORT_STORE");
