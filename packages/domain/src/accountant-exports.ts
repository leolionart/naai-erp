import {
  canonicalJson,
  sha256Hex,
  type ReportSnapshot,
  type SnapshotReadiness,
} from "./report-snapshots.js";

export const ACCOUNTANT_EXPORT_SCHEMA_VERSION = 1 as const;
export type WorkbookCellValue = null | boolean | number | string;
export type WorkbookCell = Readonly<{
  value: WorkbookCellValue;
  format?: "text" | "integer" | "money_minor" | "date" | "timestamp" | "boolean";
}>;
export type WorkbookSheet = Readonly<{
  key: string;
  name: string;
  columns: readonly Readonly<{ key: string; label: string; format?: WorkbookCell["format"] }>[];
  rows: readonly Readonly<Record<string, WorkbookCell>>[];
}>;
export type AccountantWorkbook = Readonly<{
  schemaVersion: typeof ACCOUNTANT_EXPORT_SCHEMA_VERSION;
  title: string;
  currency: string;
  snapshotId: string;
  snapshotVersion: number;
  snapshotResultHash: string;
  snapshotReadiness: SnapshotReadiness;
  sheets: readonly WorkbookSheet[];
}>;
export type AccountantExportManifest = Readonly<{
  schemaVersion: typeof ACCOUNTANT_EXPORT_SCHEMA_VERSION;
  snapshotId: string;
  snapshotVersion: number;
  snapshotResultHash: string;
  snapshotReadiness: SnapshotReadiness;
  format: "csv" | "xlsx";
  workbookHash: string;
  isFinal: boolean;
}>;

const required = (value: string, label: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
};
export function createAccountantWorkbook(
  input: Readonly<{
    snapshot: ReportSnapshot;
    title: string;
    currency: string;
    sheets: readonly WorkbookSheet[];
  }>,
): AccountantWorkbook {
  const currency = input.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Workbook currency must be ISO-4217");
  const keys = new Set<string>();
  const sheets = input.sheets.map((sheet) => {
    const key = required(sheet.key, "Workbook sheet key");
    if (keys.has(key)) throw new Error("Workbook sheet keys must be unique");
    keys.add(key);
    const columnKeys = sheet.columns.map((column) => required(column.key, "Workbook column key"));
    if (new Set(columnKeys).size !== columnKeys.length)
      throw new Error("Workbook column keys must be unique");
    for (const row of sheet.rows)
      for (const rowKey of Object.keys(row))
        if (!columnKeys.includes(rowKey))
          throw new Error(`Workbook row contains unknown column ${rowKey}`);
    return Object.freeze({
      ...sheet,
      key,
      name: required(sheet.name, "Workbook sheet name"),
      columns: Object.freeze(sheet.columns.map((column) => Object.freeze({ ...column }))),
      rows: Object.freeze(sheet.rows.map((row) => Object.freeze({ ...row }))),
    });
  });
  if (sheets.length === 0) throw new Error("Accountant workbook requires at least one sheet");
  return Object.freeze({
    schemaVersion: ACCOUNTANT_EXPORT_SCHEMA_VERSION,
    title: required(input.title, "Workbook title"),
    currency,
    snapshotId: input.snapshot.id,
    snapshotVersion: input.snapshot.version,
    snapshotResultHash: input.snapshot.resultHash,
    snapshotReadiness: input.snapshot.readiness,
    sheets: Object.freeze(sheets),
  });
}

export function createAccountantExportManifest(
  workbook: AccountantWorkbook,
  format: "csv" | "xlsx",
): AccountantExportManifest {
  const serializable = {
    ...workbook,
    sheets: workbook.sheets.map((sheet) => ({
      ...sheet,
      rows: sheet.rows.map((row) =>
        Object.fromEntries(Object.entries(row).map(([key, cell]) => [key, cell])),
      ),
    })),
  };
  return Object.freeze({
    schemaVersion: ACCOUNTANT_EXPORT_SCHEMA_VERSION,
    snapshotId: workbook.snapshotId,
    snapshotVersion: workbook.snapshotVersion,
    snapshotResultHash: workbook.snapshotResultHash,
    snapshotReadiness: workbook.snapshotReadiness,
    format,
    workbookHash: sha256Hex(canonicalJson(serializable)),
    isFinal: workbook.snapshotReadiness === "final",
  });
}

const csvEscape = (value: WorkbookCellValue) => {
  const text = value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
export function workbookSheetToCsv(sheet: WorkbookSheet): string {
  const header = sheet.columns.map((column) => csvEscape(column.label)).join(",");
  const rows = sheet.rows.map((row) =>
    sheet.columns.map((column) => csvEscape(row[column.key]?.value ?? null)).join(","),
  );
  return `${[header, ...rows].join("\r\n")}\r\n`;
}
