import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  API_VERSION,
  PORTABLE_DATA_PACKAGE_HASH_ALGORITHM,
  PORTABLE_DATA_PACKAGE_SCHEMA_VERSION,
  type PortableDataPackageManifestContract,
  type PortableRowEnvelopeContract,
  type PortableSheetInventoryContract,
} from "@naai-erp/contracts";
import ExcelJS from "exceljs";
import { MasterDataService } from "../master-data/master-data.service.js";
import {
  PORTABLE_DATA_PACKAGE_STORE,
  type PortableDataPackageContext,
  type PortableDataPackageStore,
  type PortableExportInput,
  type PortableResourceExport,
} from "./portable-data-package.types.js";

const EXPORT_ROLES = new Set(["owner", "finance_admin", "accountant"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const FORBIDDEN_COLUMN =
  /(^|_)(secret|password|token_hash|access_token|refresh_token|private_key|payload_bytes|raw_bytes|file_bytes|content_bytes|blob)($|_)/i;

const jsonValue = (value: unknown): unknown => {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return "[BINARY_EXCLUDED]";
  if (Array.isArray(value)) return value.map(jsonValue);
  if (typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !FORBIDDEN_COLUMN.test(key))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, jsonValue(nested)]),
    );
  return value;
};

const canonicalJson = (value: unknown) => JSON.stringify(jsonValue(value));
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

const normalizeZipTimestamps = (input: Buffer) => {
  const output = Buffer.from(input);
  let eocd = -1;
  for (let offset = output.length - 22; offset >= Math.max(0, output.length - 65_557); offset -= 1)
    if (output.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  if (eocd < 0) throw new Error("PORTABLE_EXPORT_INVALID_XLSX");
  const entryCount = output.readUInt16LE(eocd + 10);
  let centralOffset = output.readUInt32LE(eocd + 16);
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (output.readUInt32LE(centralOffset) !== 0x02014b50)
      throw new Error("PORTABLE_EXPORT_INVALID_XLSX");
    const localOffset = output.readUInt32LE(centralOffset + 42);
    for (const timestampOffset of [centralOffset + 12, localOffset + 10]) {
      output.writeUInt16LE(0, timestampOffset);
      output.writeUInt16LE(0x21, timestampOffset + 2);
    }
    centralOffset +=
      46 +
      output.readUInt16LE(centralOffset + 28) +
      output.readUInt16LE(centralOffset + 30) +
      output.readUInt16LE(centralOffset + 32);
  }
  return output;
};

const sheetName = (tableName: string, used: Set<string>) => {
  const safe = tableName.replace(/[\\/?*:[\]]/g, "_").slice(0, 31) || "data";
  if (!used.has(safe)) {
    used.add(safe);
    return safe;
  }
  for (let index = 2; ; index += 1) {
    const suffix = `_${index}`;
    const candidate = `${safe.slice(0, 31 - suffix.length)}${suffix}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
};

@Injectable()
export class PortableDataPackageService {
  constructor(
    @Inject(PORTABLE_DATA_PACKAGE_STORE) private readonly store: PortableDataPackageStore,
    @Inject(MasterDataService) private readonly master: MasterDataService,
  ) {}

  authenticate(authorization: string | undefined, organizationId: string, correlationId: string) {
    return this.master.authenticate(authorization, organizationId, correlationId);
  }

  parseExportInput(input: Record<string, unknown>): PortableExportInput {
    if (!DATE.test(String(input.asOf ?? "")) || (input.format ?? "xlsx") !== "xlsx")
      throw new Error("VALIDATION_FAILED");
    return { asOf: String(input.asOf), format: "xlsx" };
  }

  private envelope(context: PortableDataPackageContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data,
    };
  }

  private assertExportPermission(context: PortableDataPackageContext) {
    if (!context.roles.some((role) => EXPORT_ROLES.has(role))) throw new Error("FORBIDDEN");
  }

  private validateResources(resources: readonly PortableResourceExport[]) {
    const seen = new Set<string>();
    for (const resource of resources) {
      const { inventory, schema, rows } = resource;
      if (!inventory.resourceType.trim() || seen.has(inventory.resourceType))
        throw new Error("PORTABLE_EXPORT_INVENTORY_INCOMPLETE");
      seen.add(inventory.resourceType);
      if (inventory.excluded) {
        if (!inventory.exclusionReason?.trim() || schema || rows?.length)
          throw new Error("PORTABLE_EXPORT_INVENTORY_INCOMPLETE");
        continue;
      }
      if (!schema || !rows || schema.resourceType !== inventory.resourceType)
        throw new Error("PORTABLE_EXPORT_INVENTORY_INCOMPLETE");
      if (schema.columns.some((column) => FORBIDDEN_COLUMN.test(column.key)))
        throw new Error("PORTABLE_EXPORT_SECRET_COLUMN");
      for (const row of rows) {
        if (!Number.isInteger(row.rowNumber) || row.rowNumber < 2)
          throw new Error("PORTABLE_EXPORT_ROW_INVALID");
        if (Object.keys(row.data).some((key) => FORBIDDEN_COLUMN.test(key)))
          throw new Error("PORTABLE_EXPORT_SECRET_COLUMN");
      }
    }
  }

  private sanitizeRow(row: PortableRowEnvelopeContract): PortableRowEnvelopeContract {
    return jsonValue(row) as PortableRowEnvelopeContract;
  }

  private async workbook(
    context: PortableDataPackageContext,
    input: PortableExportInput,
    resources: readonly PortableResourceExport[],
    generatedAt: string,
    packageId: string,
  ) {
    this.validateResources(resources);
    const usedSheets = new Set(["_manifest"]);
    const included = [...resources]
      .filter((resource) => !resource.inventory.excluded)
      .sort(
        (a, b) =>
          a.inventory.dependencyOrder - b.inventory.dependencyOrder ||
          a.inventory.resourceType.localeCompare(b.inventory.resourceType),
      )
      .map((resource) => {
        const schema = resource.schema!;
        const rows = resource.rows!.map((row) => this.sanitizeRow(row));
        return {
          ...resource,
          schema: { ...schema, sheetName: sheetName(schema.sheetName, usedSheets) },
          rows,
        };
      });
    const inventory: PortableSheetInventoryContract[] = resources
      .filter((resource) => resource.inventory.excluded)
      .map((resource) => ({ ...resource.inventory, rowCount: 0 }))
      .concat(
        included.map((resource) => ({
          ...resource.inventory,
          sheetName: resource.schema.sheetName,
          headerCount: 5 + resource.schema.columns.length,
          rowCount: resource.rows.length,
          sha256: sha256(canonicalJson(resource.rows)),
        })),
      )
      .sort(
        (a, b) =>
          a.dependencyOrder - b.dependencyOrder || a.resourceType.localeCompare(b.resourceType),
      );
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "NAAI ERP";
    workbook.created = new Date("1980-01-01T00:00:00.000Z");
    workbook.modified = workbook.created;
    const manifestSheet = workbook.addWorksheet("_manifest");
    manifestSheet.addRow(["schema_version", PORTABLE_DATA_PACKAGE_SCHEMA_VERSION]);
    manifestSheet.addRow(["package_id", packageId]);
    manifestSheet.addRow(["organization_id", context.organizationId]);
    manifestSheet.addRow(["as_of", input.asOf]);
    manifestSheet.addRow(["exported_at", generatedAt]);
    manifestSheet.addRow([]);
    manifestSheet.addRow([
      "resource_type",
      "sheet_name",
      "excluded",
      "exclusion_reason",
      "schema_version",
      "dependency_order",
      "mutability",
      "header_count",
      "row_count",
      "sha256",
    ]);
    for (const item of inventory)
      manifestSheet.addRow([
        item.resourceType,
        item.sheetName ?? null,
        item.excluded,
        item.exclusionReason ?? null,
        item.schemaVersion,
        item.dependencyOrder,
        item.mutability,
        item.headerCount ?? null,
        item.rowCount,
        item.sha256 ?? null,
      ]);
    for (const resource of included) {
      const sheet = workbook.addWorksheet(resource.schema.sheetName);
      sheet.addRow([
        resource.schema.operationColumn,
        resource.schema.stableIdColumn,
        resource.schema.resourceVersionColumn ?? "expectedResourceVersion",
        "externalReferences",
        "relationships",
        ...resource.schema.columns.map((column) => column.header),
      ]);
      const keys = resource.schema.columns.map((column) => column.key);
      const rows = resource.rows;
      for (const row of rows)
        sheet.addRow([
          row.operation,
          row.stableId ?? null,
          row.expectedResourceVersion ?? null,
          canonicalJson(row.externalReferences),
          canonicalJson(row.relationships),
          ...keys.map((key) => row.data[key] ?? null),
        ]);
    }
    const raw = await workbook.xlsx.writeBuffer();
    const content = normalizeZipTimestamps(Buffer.from(raw));
    const workbookSha256 = sha256(content);
    const manifestBase = {
      schemaVersion: PORTABLE_DATA_PACKAGE_SCHEMA_VERSION,
      packageId,
      organizationId: context.organizationId,
      exportedAt: generatedAt,
      asOf: input.asOf,
      exportedBy: context.actorId,
      sourceSystem: "naai-erp" as const,
      sourceApiVersion: "v1" as const,
      hashAlgorithm: PORTABLE_DATA_PACKAGE_HASH_ALGORITHM,
      workbookSha256,
      sheets: inventory,
      totalSheetCount: inventory.filter((item) => !item.excluded).length,
      totalRowCount: inventory.reduce((sum, item) => sum + item.rowCount, 0),
    };
    const manifest: PortableDataPackageManifestContract = {
      ...manifestBase,
      packageHash: sha256(canonicalJson(manifestBase)),
    };
    return { content, manifest, schemas: included.map((resource) => resource.schema) };
  }

  async createExport(
    context: PortableDataPackageContext,
    input: PortableExportInput,
    idempotencyKey?: string,
  ) {
    this.assertExportPermission(context);
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const generatedAt = new Date().toISOString();
    const packageId = randomUUID();
    const resources = await this.store.collectOrganizationResources(context, input.asOf);
    const { content, manifest, schemas } = await this.workbook(
      context,
      input,
      resources,
      generatedAt,
      packageId,
    );
    const filename = `naai-erp-${context.organizationId}-${input.asOf}.xlsx`;
    const record = await this.store.saveExport(
      context,
      {
        packageId,
        input,
        content,
        contentHash: sha256(content),
        filename,
        mediaType: XLSX_MEDIA_TYPE,
        manifest,
        schemas,
      },
      idempotencyKey,
    );
    return this.envelope(context, record);
  }

  async getExport(context: PortableDataPackageContext, packageId: string) {
    this.assertExportPermission(context);
    const record = await this.store.getExport(context, packageId);
    if (!record) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(context, record);
  }

  async getInventory(context: PortableDataPackageContext, packageId: string) {
    this.assertExportPermission(context);
    const record = await this.store.getExport(context, packageId);
    if (!record) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(context, record.manifest);
  }

  async download(context: PortableDataPackageContext, packageId: string) {
    this.assertExportPermission(context);
    const file = await this.store.downloadExport(context, packageId);
    if (!file) throw new Error("RESOURCE_NOT_FOUND");
    return file;
  }
}
