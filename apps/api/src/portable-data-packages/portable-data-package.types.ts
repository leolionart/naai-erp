import type {
  PortableDataPackageManifestContract,
  PortableRowEnvelopeContract,
  PortableSheetInventoryContract,
  PortableSheetSchemaContract,
} from "@naai-erp/contracts";
import type { JournalActorContext } from "../journals/journal.types.js";

export type PortableDataPackageContext = JournalActorContext;
export type PortableExportInput = Readonly<{ asOf: string; format: "xlsx" }>;

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
  downloadExport(
    context: PortableDataPackageContext,
    packageId: string,
  ): Promise<PortablePackageFile | undefined>;
}>;

export const PORTABLE_DATA_PACKAGE_STORE = Symbol("PORTABLE_DATA_PACKAGE_STORE");
