import type { AccountantReportKindContract, ReportSnapshotContract } from "./report-snapshots.js";
export const ACCOUNTANT_EXPORT_CONTRACT_VERSION = 1 as const;
export type WorkbookCellValueContract = null | boolean | number | string;
export type WorkbookCellContract = Readonly<{
  value: WorkbookCellValueContract;
  format?: "text" | "integer" | "money_minor" | "date" | "timestamp" | "boolean";
}>;
export type WorkbookSheetContract = Readonly<{
  key: string;
  name: string;
  columns: readonly Readonly<{
    key: string;
    label: string;
    format?: WorkbookCellContract["format"];
  }>[];
  rows: readonly Readonly<Record<string, WorkbookCellContract>>[];
}>;
export type AccountantWorkbookContract = Readonly<{
  schemaVersion: typeof ACCOUNTANT_EXPORT_CONTRACT_VERSION;
  title: string;
  currency: string;
  snapshotId: string;
  snapshotVersion: number;
  snapshotResultHash: string;
  snapshotReadiness: "review_required" | "final";
  sheets: readonly WorkbookSheetContract[];
}>;
export type CreateAccountantExportRequest = Readonly<{
  snapshotId: string;
  snapshotVersion: number;
  format: "csv" | "xlsx";
  reportKind: AccountantReportKindContract;
}>;
export type AccountantExportContract = Readonly<{
  schemaVersion: typeof ACCOUNTANT_EXPORT_CONTRACT_VERSION;
  id: string;
  version: number;
  snapshotId: string;
  snapshotVersion: number;
  snapshot: ReportSnapshotContract;
  format: "csv" | "xlsx";
  workbookHash: string;
  state: "generated" | "superseded";
  isFinal: boolean;
  createdAt: string;
  createdBy: string;
  downloadUrl?: string;
}>;
