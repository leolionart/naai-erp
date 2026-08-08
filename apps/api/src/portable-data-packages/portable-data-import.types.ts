import type {
  PortableDataPackageManifestContract,
  PortableDryRunResultContract,
  PortableDryRunRowResultContract,
  PortableRowEnvelopeContract,
  PortableRowIssueContract,
  PortableSheetInventoryContract,
  PortableSheetSchemaContract,
} from "@naai-erp/contracts";
import type { PortableDataPackageContext } from "./portable-data-package.types.js";

export type PortableWorkbookUpload = Readonly<{ filename: string; content: Buffer }>;

export type ParsedPortableSheet = Readonly<{
  resourceType: string;
  sheetName: string;
  schema: PortableSheetSchemaContract;
  dependencyOrder: number;
  rows: readonly PortableRowEnvelopeContract[];
  sha256: string;
}>;

export type PortableImportInventory = Readonly<{
  importId: string;
  packageId: string;
  organizationId: string;
  workbookSha256: string;
  packageHash: string;
  valid: boolean;
  issues: readonly PortableRowIssueContract[];
  sheets: readonly PortableSheetInventoryContract[];
  parsedSheets: readonly ParsedPortableSheet[];
  sourcePackage?: Readonly<{
    manifest: PortableDataPackageManifestContract;
    schemas: readonly PortableSheetSchemaContract[];
    content: Buffer;
    filename: string;
    mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }>;
}>;

export type PortableImportRecord = Readonly<{
  importId: string;
  packageId: string;
  organizationId: string;
  state: "inventoried" | "dry_run_valid" | "dry_run_invalid" | "committed";
  workbookSha256: string;
  packageHash: string;
  dryRunId?: string;
  dryRun?: PortableDryRunResultContract;
  commitResult?: PortableImportCommitResult;
}>;

export type PortableImportCommitResult = Readonly<{
  importId: string;
  dryRunId: string;
  workbookSha256: string;
  committed: boolean;
  applied: number;
  unchanged: number;
  failed: number;
  rows: readonly PortableDryRunRowResultContract[];
}>;
export type EmptyOrganizationRestoreInput = Readonly<{
  sourceOrganizationId: string;
  confirmTargetOrganizationId: string;
  packageId: string;
  workbookSha256: string;
  reason: string;
  workbookBase64: string;
  mapSourceActorsToTargetActor: true;
}>;
export type EmptyOrganizationRestoreResult = Readonly<{
  sourceOrganizationId: string;
  targetOrganizationId: string;
  packageId: string;
  workbookSha256: string;
  restoredRows: number;
  restoredByResource: Readonly<Record<string, number>>;
  sourceHash: string;
  targetHash: string;
  balancedJournalCount: number;
  auditEventId: string;
  idempotencyReplayed: boolean;
}>;

export type PortableCanonicalRowValidation = Readonly<{
  disposition: PortableDryRunRowResultContract["disposition"];
  issues?: readonly PortableRowIssueContract[];
  resolvedReferences?: Readonly<Record<string, string>>;
}>;

export type PortableCanonicalApplyResult =
  | Readonly<{ applied: true; stableId?: string }>
  | Readonly<{ applied: false; issue: PortableRowIssueContract }>;

export type PortableDataImportStore = Readonly<{
  getSourcePackage(
    context: PortableDataPackageContext,
    packageId: string,
  ): Promise<
    | Readonly<{
        manifest: PortableDataPackageManifestContract;
        schemas: readonly PortableSheetSchemaContract[];
      }>
    | undefined
  >;
  saveInventory(
    context: PortableDataPackageContext,
    inventory: PortableImportInventory,
    idempotencyKey: string,
  ): Promise<PortableImportRecord & { parsedSheets?: readonly ParsedPortableSheet[] }>;
  getImport(
    context: PortableDataPackageContext,
    importId: string,
  ): Promise<PortableImportRecord | undefined>;
  saveDryRun(
    context: PortableDataPackageContext,
    importId: string,
    dryRunId: string,
    result: PortableDryRunResultContract,
    parsedSheets: readonly ParsedPortableSheet[],
    idempotencyKey: string,
  ): Promise<PortableImportRecord>;
  validateCanonicalRow(
    context: PortableDataPackageContext,
    resourceType: string,
    row: PortableRowEnvelopeContract,
  ): Promise<PortableCanonicalRowValidation>;
  applyCanonicalRow(
    context: PortableDataPackageContext,
    resourceType: string,
    row: PortableRowEnvelopeContract,
    idempotencyKey: string,
  ): Promise<PortableCanonicalApplyResult>;
  saveCommit(
    context: PortableDataPackageContext,
    importId: string,
    result: PortableImportCommitResult,
    idempotencyKey: string,
  ): Promise<PortableImportRecord>;
  restoreEmptyOrganization(
    context: PortableDataPackageContext,
    sourceOrganizationId: string,
    packageId: string,
    workbookSha256: string,
    reason: string,
    mapSourceActorsToTargetActor: true,
    parsedSheets: readonly ParsedPortableSheet[],
    idempotencyKey: string,
  ): Promise<EmptyOrganizationRestoreResult>;
}>;

export const PORTABLE_DATA_IMPORT_STORE = Symbol("PORTABLE_DATA_IMPORT_STORE");
