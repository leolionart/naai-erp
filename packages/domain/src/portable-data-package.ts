import { canonicalJson, sha256Hex, type CanonicalJsonValue } from "./report-snapshots.js";
export const PORTABLE_DATA_PACKAGE_SCHEMA_VERSION = 1 as const;
export type PortableRowOperation =
  "no_change" | "create" | "update" | "deactivate" | "cancel" | "reverse_replace";
export type PortableSheetInventory = Readonly<{
  resourceType: string;
  sheetName?: string;
  excluded: boolean;
  exclusionReason?: string;
  schemaVersion: number;
  dependencyOrder: number;
  mutability: "editable" | "deactivate_only" | "correction_only" | "read_only";
  headerCount?: number;
  rowCount: number;
  sha256?: string;
}>;
export type PortableDataPackageManifest = Readonly<{
  schemaVersion: typeof PORTABLE_DATA_PACKAGE_SCHEMA_VERSION;
  packageId: string;
  organizationId: string;
  exportedAt: string;
  asOf: string;
  exportedBy: string;
  sourceSystem: "naai-erp";
  sourceApiVersion: "v1";
  hashAlgorithm: "sha256";
  workbookSha256: string;
  sheets: readonly PortableSheetInventory[];
  totalSheetCount: number;
  totalRowCount: number;
  packageHash: string;
}>;
const required = (value: string, label: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
};
const hash = (value: string, label: string) => {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} must be a lowercase SHA-256 hash`);
  return value;
};
const timestamp = (value: string, label: string) => {
  if (!value.includes("T") || Number.isNaN(Date.parse(value)))
    throw new Error(`${label} must be an ISO timestamp`);
  return value;
};
export function hashPortableRows(
  rows: readonly Readonly<Record<string, CanonicalJsonValue>>[],
): string {
  return sha256Hex(canonicalJson(rows));
}
export function packageHashForInventory(
  input: Readonly<{ organizationId: string; sheets: readonly PortableSheetInventory[] }>,
): string {
  return sha256Hex(
    canonicalJson({
      organizationId: required(input.organizationId, "Organization ID"),
      sheets: [...input.sheets]
        .sort((a, b) => a.resourceType.localeCompare(b.resourceType))
        .map((sheet) => ({ ...sheet })),
    }),
  );
}
export function assertPortableInventoryComplete(
  input: Readonly<{
    expectedResourceTypes: readonly string[];
    sheets: readonly PortableSheetInventory[];
  }>,
): void {
  const expected = new Set(input.expectedResourceTypes.map((v) => required(v, "Resource type")));
  const actual = new Set(input.sheets.map((v) => v.resourceType));
  const missing = [...expected].filter((v) => !actual.has(v)).sort();
  const unknown = [...actual].filter((v) => !expected.has(v)).sort();
  if (missing.length)
    throw new Error(`Portable package is missing resources: ${missing.join(", ")}`);
  if (unknown.length)
    throw new Error(`Portable package contains unknown resources: ${unknown.join(", ")}`);
}
export function createPortableDataPackageManifest(
  input: Readonly<{
    packageId: string;
    organizationId: string;
    exportedAt: string;
    asOf: string;
    exportedBy: string;
    workbookSha256: string;
    sheets: readonly PortableSheetInventory[];
  }>,
): PortableDataPackageManifest {
  const packageId = required(input.packageId, "Package ID"),
    organizationId = required(input.organizationId, "Organization ID"),
    exportedBy = required(input.exportedBy, "Exported by");
  const names = new Set<string>(),
    resources = new Set<string>();
  const sheets = input.sheets.map((sheet) => {
    const resourceType = required(sheet.resourceType, "Resource type");
    if (resources.has(resourceType)) throw new Error(`Duplicate resource type: ${resourceType}`);
    resources.add(resourceType);
    if (!Number.isInteger(sheet.schemaVersion) || sheet.schemaVersion < 1)
      throw new Error("Sheet schema version must be a positive integer");
    if (!Number.isInteger(sheet.dependencyOrder) || sheet.dependencyOrder < 0)
      throw new Error("Dependency order must be a non-negative integer");
    if (!Number.isInteger(sheet.rowCount) || sheet.rowCount < 0)
      throw new Error("Sheet row count must be a non-negative integer");
    if (sheet.excluded) {
      if (!sheet.exclusionReason?.trim()) throw new Error("Excluded resources require a reason");
      if (sheet.sheetName || sheet.sha256 || sheet.rowCount !== 0)
        throw new Error("Excluded resources must not describe workbook rows");
      return Object.freeze({
        ...sheet,
        resourceType,
        exclusionReason: sheet.exclusionReason.trim(),
      });
    }
    const sheetName = required(sheet.sheetName ?? "", "Sheet name");
    if (names.has(sheetName)) throw new Error(`Duplicate sheet name: ${sheetName}`);
    names.add(sheetName);
    if (!Number.isInteger(sheet.headerCount) || sheet.headerCount! < 1)
      throw new Error("Sheet header count must be a positive integer");
    return Object.freeze({
      ...sheet,
      resourceType,
      sheetName,
      sha256: hash(sheet.sha256 ?? "", "Sheet hash"),
    });
  });
  return Object.freeze({
    schemaVersion: 1,
    packageId,
    organizationId,
    exportedAt: timestamp(input.exportedAt, "Exported at"),
    asOf: timestamp(input.asOf, "As of"),
    exportedBy,
    sourceSystem: "naai-erp",
    sourceApiVersion: "v1",
    hashAlgorithm: "sha256",
    workbookSha256: hash(input.workbookSha256, "Workbook hash"),
    sheets: Object.freeze(sheets),
    totalSheetCount: sheets.filter((s) => !s.excluded).length,
    totalRowCount: sheets.reduce((n, s) => n + s.rowCount, 0),
    packageHash: packageHashForInventory({ organizationId, sheets }),
  });
}
export function assertPortableRowOperation(
  input: Readonly<{
    operation: PortableRowOperation;
    stableId?: string;
    expectedResourceVersion?: string;
  }>,
): void {
  if (input.operation === "create") {
    if (input.stableId) throw new Error("Create rows must not provide a stable ID");
    if (input.expectedResourceVersion)
      throw new Error("Create rows must not provide an expected resource version");
    return;
  }
  if (!input.stableId?.trim()) throw new Error(`${input.operation} rows require a stable ID`);
  if (input.operation !== "no_change" && !input.expectedResourceVersion?.trim())
    throw new Error(`${input.operation} rows require an expected resource version`);
}
