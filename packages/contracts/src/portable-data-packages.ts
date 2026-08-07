export const PORTABLE_DATA_PACKAGE_SCHEMA_VERSION = 1 as const;
export const PORTABLE_DATA_PACKAGE_HASH_ALGORITHM = "sha256" as const;
export type PortableCellTypeContract =
  "string" | "integer" | "boolean" | "date" | "timestamp" | "json";
export type PortableResourceMutabilityContract =
  "editable" | "deactivate_only" | "correction_only" | "read_only";
export type PortableSheetColumnContract = Readonly<{
  key: string;
  header: string;
  type: PortableCellTypeContract;
  required: boolean;
  editable: boolean;
  description?: string;
}>;
export type PortableSheetSchemaContract = Readonly<{
  resourceType: string;
  sheetName: string;
  schemaVersion: number;
  stableIdColumn: string;
  resourceVersionColumn?: string;
  operationColumn: string;
  columns: readonly PortableSheetColumnContract[];
}>;
export type PortableSheetInventoryContract = Readonly<{
  resourceType: string;
  sheetName?: string;
  excluded: boolean;
  exclusionReason?: string;
  schemaVersion: number;
  dependencyOrder: number;
  mutability: PortableResourceMutabilityContract;
  headerCount?: number;
  rowCount: number;
  sha256?: string;
}>;
export type PortableDataPackageManifestContract = Readonly<{
  schemaVersion: typeof PORTABLE_DATA_PACKAGE_SCHEMA_VERSION;
  packageId: string;
  organizationId: string;
  exportedAt: string;
  asOf: string;
  exportedBy: string;
  sourceSystem: "naai-erp";
  sourceApiVersion: "v1";
  hashAlgorithm: typeof PORTABLE_DATA_PACKAGE_HASH_ALGORITHM;
  workbookSha256: string;
  sheets: readonly PortableSheetInventoryContract[];
  totalSheetCount: number;
  totalRowCount: number;
  packageHash: string;
}>;
export type PortableRowOperationContract =
  "no_change" | "create" | "update" | "deactivate" | "cancel" | "reverse_replace";
export type PortableExternalReferenceContract = Readonly<{ system: string; externalId: string }>;
export type PortableRowEnvelopeContract = Readonly<{
  rowNumber: number;
  operation: PortableRowOperationContract;
  stableId?: string;
  externalReferences: readonly PortableExternalReferenceContract[];
  expectedResourceVersion?: string;
  data: Readonly<Record<string, string | boolean | null>>;
  relationships: Readonly<Record<string, string | null>>;
}>;
export type PortableRowIssueContract = Readonly<{
  code: string;
  message: string;
  field?: string;
  severity: "error" | "warning";
}>;
export type PortableDryRunRowResultContract = Readonly<{
  sheetName: string;
  resourceType: string;
  rowNumber: number;
  stableId?: string;
  operation: PortableRowOperationContract;
  disposition: "ready" | "invalid" | "conflict" | "unchanged";
  issues: readonly PortableRowIssueContract[];
  resolvedReferences: Readonly<Record<string, string>>;
}>;
export type PortableDryRunResultContract = Readonly<{
  schemaVersion: typeof PORTABLE_DATA_PACKAGE_SCHEMA_VERSION;
  packageId: string;
  organizationId: string;
  packageHash: string;
  dryRun: true;
  mutationCount: 0;
  valid: boolean;
  totals: Readonly<{
    sheets: number;
    rows: number;
    ready: number;
    invalid: number;
    conflicts: number;
    unchanged: number;
  }>;
  sheetInventory: readonly PortableSheetInventoryContract[];
  rows: readonly PortableDryRunRowResultContract[];
}>;
