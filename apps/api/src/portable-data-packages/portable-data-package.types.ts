import type {
  PortableDataPackageManifestContract,
  PortableRowEnvelopeContract,
  PortableSheetInventoryContract,
  PortableSheetSchemaContract,
} from "@naai-erp/contracts";
import type { JournalActorContext } from "../journals/journal.types.js";

export type PortableDataPackageContext = JournalActorContext;
export type PortableExportInput = Readonly<{ asOf: string; format: "xlsx" }>;
export type LocalOrganizationResetInput = Readonly<{
  confirmOrganizationId: string;
  packageId: string;
  workbookSha256: string;
}>;
export type LocalOrganizationResetResult = Readonly<{
  organizationId: string;
  packageId: string;
  workbookSha256: string;
  deletedRows: number;
  deletedByTable: Readonly<Record<string, number>>;
  preservedTables: readonly string[];
  auditEventId: string;
  idempotencyReplayed: boolean;
}>;

export type PortableResourceExport = Readonly<{
  inventory: Omit<PortableSheetInventoryContract, "headerCount" | "rowCount" | "sha256">;
  schema?: PortableSheetSchemaContract;
  rows?: readonly PortableRowEnvelopeContract[];
}>;

export type PortablePackageRecord = Readonly<{
  packageId: string;
  organizationId: string;
  asOf: string;
  format: "xlsx";
  filename: string;
  mediaType: string;
  sizeBytes: number;
  contentHash: string;
  manifest: PortableDataPackageManifestContract;
  generatedAt: string;
  generatedBy: string;
  correlationId: string;
  contentPrunedAt?: string | null;
}>;

export type PortablePackageFile = Readonly<{
  content: Buffer;
  filename: string;
  mediaType: string;
  contentHash: string;
}>;

export type SavePortablePackageInput = Readonly<{
  packageId: string;
  input: PortableExportInput;
  content: Buffer;
  contentHash: string;
  filename: string;
  mediaType: string;
  manifest: PortableDataPackageManifestContract;
  schemas: readonly PortableSheetSchemaContract[];
}>;

export type PortableDataPackageStore = Readonly<{
  collectOrganizationResources(
    context: PortableDataPackageContext,
    asOf: string,
  ): Promise<readonly PortableResourceExport[]>;
  saveExport(
    context: PortableDataPackageContext,
    input: SavePortablePackageInput,
    idempotencyKey: string,
  ): Promise<PortablePackageRecord>;
  getExport(
    context: PortableDataPackageContext,
    packageId: string,
  ): Promise<PortablePackageRecord | undefined>;
  listExports(
    context: PortableDataPackageContext,
    limit?: number,
  ): Promise<readonly PortablePackageRecord[]>;
  downloadExport(
    context: PortableDataPackageContext,
    packageId: string,
  ): Promise<PortablePackageFile | undefined>;
  deleteExport?: (
    context: PortableDataPackageContext,
    packageId: string,
    idempotencyKey: string,
  ) => Promise<{ packageId: string; deleted: boolean }>;
  resetLocalOrganization(
    context: PortableDataPackageContext,
    input: LocalOrganizationResetInput,
    idempotencyKey: string,
  ): Promise<LocalOrganizationResetResult>;
}>;

export const PORTABLE_DATA_PACKAGE_STORE = Symbol("PORTABLE_DATA_PACKAGE_STORE");
