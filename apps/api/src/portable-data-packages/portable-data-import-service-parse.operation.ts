import { randomUUID } from "node:crypto";
import {
  PORTABLE_DATA_PACKAGE_SCHEMA_VERSION,
  type PortableDataPackageManifestContract,
  type PortableRowEnvelopeContract,
  type PortableRowIssueContract,
  type PortableSheetInventoryContract,
  type PortableSheetSchemaContract,
} from "@naai-erp/contracts";
import { assertPortableRowOperation, hashPortableRows } from "@naai-erp/domain";
import ExcelJS from "exceljs";
import type { PortableDataPackageContext } from "./portable-data-package.types.js";
import {
  type ParsedPortableSheet,
  type PortableImportInventory,
  type PortableWorkbookUpload,
} from "./portable-data-import.types.js";
import {
  OPERATIONS,
  issue,
  jsonExternalReferences,
  jsonObject,
  packageHash,
  sha256,
  text,
} from "./portable-data-import.service.shared.js";
import type { PortableDataImportService } from "./portable-data-import.service.js";

export async function parseOperation(
  this: PortableDataImportService,
  context: PortableDataPackageContext,
  upload: PortableWorkbookUpload,
  expectedSourceOrganizationId = context.organizationId,
) {
  this.authorize(context);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(upload.content as never);
  const manifestSheet = workbook.getWorksheet("_manifest");
  if (!manifestSheet) throw new Error("PORTABLE_IMPORT_MANIFEST_MISSING");
  const values = new Map<string, string>();
  for (let row = 1; row <= Math.min(manifestSheet.rowCount, 20); row += 1)
    values.set(
      text(manifestSheet.getCell(row, 1).value),
      text(manifestSheet.getCell(row, 2).value),
    );
  const packageId = values.get("package_id") ?? "";
  if (!packageId) throw new Error("PORTABLE_IMPORT_PACKAGE_ID_MISSING");
  if (values.get("organization_id") !== expectedSourceOrganizationId)
    throw new Error("PORTABLE_IMPORT_ORGANIZATION_MISMATCH");
  if (Number(values.get("schema_version")) !== PORTABLE_DATA_PACKAGE_SCHEMA_VERSION)
    throw new Error("PORTABLE_IMPORT_SCHEMA_VERSION_UNSUPPORTED");
  const schemaSheet = workbook.getWorksheet("_schemas");
  if (!schemaSheet) throw new Error("PORTABLE_IMPORT_SCHEMA_MISSING");
  const schemas: PortableSheetSchemaContract[] = [];
  for (let row = 2; row <= schemaSheet.rowCount; row += 1) {
    const raw = text(schemaSheet.getCell(row, 2).value);
    if (raw) schemas.push(JSON.parse(raw) as PortableSheetSchemaContract);
  }
  let inventoryHeaderRow = 0;
  for (let row = 1; row <= manifestSheet.rowCount; row += 1)
    if (text(manifestSheet.getCell(row, 1).value) === "resource_type") {
      inventoryHeaderRow = row;
      break;
    }
  if (!inventoryHeaderRow) throw new Error("PORTABLE_IMPORT_INVENTORY_MISSING");
  const sheetInventory: PortableSheetInventoryContract[] = [];
  for (let row = inventoryHeaderRow + 1; row <= manifestSheet.rowCount; row += 1) {
    const resourceType = text(manifestSheet.getCell(row, 1).value);
    if (!resourceType) continue;
    const excludedRaw = manifestSheet.getCell(row, 3).value;
    const excluded = excludedRaw === true || text(excludedRaw) === "true";
    sheetInventory.push({
      resourceType,
      ...(text(manifestSheet.getCell(row, 2).value)
        ? { sheetName: text(manifestSheet.getCell(row, 2).value) }
        : {}),
      excluded,
      ...(text(manifestSheet.getCell(row, 4).value)
        ? { exclusionReason: text(manifestSheet.getCell(row, 4).value) }
        : {}),
      schemaVersion: Number(text(manifestSheet.getCell(row, 5).value)),
      dependencyOrder: Number(text(manifestSheet.getCell(row, 6).value)),
      mutability: text(
        manifestSheet.getCell(row, 7).value,
      ) as PortableSheetInventoryContract["mutability"],
      ...(text(manifestSheet.getCell(row, 8).value)
        ? { headerCount: Number(text(manifestSheet.getCell(row, 8).value)) }
        : {}),
      rowCount: Number(text(manifestSheet.getCell(row, 9).value)),
      ...(text(manifestSheet.getCell(row, 10).value)
        ? { sha256: text(manifestSheet.getCell(row, 10).value) }
        : {}),
    });
  }
  const embeddedPackageHash = values.get("package_hash") ?? "";
  const embeddedHashPayload = {
    schemaVersion: PORTABLE_DATA_PACKAGE_SCHEMA_VERSION,
    packageId,
    organizationId: expectedSourceOrganizationId,
    exportedAt: values.get("exported_at") ?? "",
    asOf: values.get("as_of") ?? "",
    exportedBy: values.get("exported_by") ?? "",
    sourceSystem: "naai-erp" as const,
    sourceApiVersion: "v1" as const,
    hashAlgorithm: "sha256" as const,
    sheets: sheetInventory,
    schemas,
    totalSheetCount: sheetInventory.filter((item) => !item.excluded).length,
    totalRowCount: sheetInventory.reduce((sum, item) => sum + item.rowCount, 0),
  };
  if (!embeddedPackageHash || packageHash(embeddedHashPayload) !== embeddedPackageHash)
    throw new Error("PORTABLE_IMPORT_PACKAGE_HASH_INVALID");
  const embeddedManifest: PortableDataPackageManifestContract = {
    ...embeddedHashPayload,
    workbookSha256: sha256(upload.content),
    packageHash: embeddedPackageHash,
  };
  const persistedSource = await this.store.getSourcePackage(context, packageId);
  if (persistedSource && persistedSource.manifest.packageHash !== embeddedPackageHash)
    throw new Error("PORTABLE_IMPORT_PACKAGE_HASH_MISMATCH");
  const source = persistedSource ?? { manifest: embeddedManifest, schemas };
  const issues: PortableRowIssueContract[] = [];
  const parsedSheets: ParsedPortableSheet[] = [];
  const expectedNames = new Set(
    source.manifest.sheets.filter((x) => !x.excluded).map((x) => x.sheetName!),
  );
  for (const sheet of workbook.worksheets)
    if (!new Set(["_manifest", "_schemas"]).has(sheet.name) && !expectedNames.has(sheet.name))
      issues.push(issue("UNKNOWN_SHEET", `Unknown workbook sheet ${sheet.name}`));
  for (const inventory of source.manifest.sheets.filter((x) => !x.excluded)) {
    const sheet = workbook.getWorksheet(inventory.sheetName!);
    const schema = source.schemas.find((x) => x.resourceType === inventory.resourceType);
    if (!sheet || !schema) {
      issues.push(issue("MISSING_SHEET", `Missing required sheet ${inventory.sheetName}`));
      continue;
    }
    const expectedHeaders = [
      schema.operationColumn,
      schema.stableIdColumn,
      schema.resourceVersionColumn ?? "expectedResourceVersion",
      "externalReferences",
      "relationships",
      ...schema.columns.map((column) => column.header),
    ];
    const headers = expectedHeaders.map((_, index) => text(sheet.getCell(1, index + 1).value));
    if (headers.some((header, index) => header !== expectedHeaders[index])) {
      issues.push(issue("HEADER_MISMATCH", `Headers changed for sheet ${sheet.name}`));
      continue;
    }
    const rows: PortableRowEnvelopeContract[] = [];
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const rowValues = sheet.getRow(rowNumber).values;
      if (
        Array.isArray(rowValues) &&
        rowValues.every((value) => value == null || text(value as ExcelJS.CellValue) === "")
      )
        continue;
      try {
        const operation = text(sheet.getCell(rowNumber, 1).value);
        if (!OPERATIONS.has(operation)) throw new Error(`Unsupported operation ${operation}`);
        const stableId = text(sheet.getCell(rowNumber, 2).value) || undefined;
        const expectedResourceVersion = text(sheet.getCell(rowNumber, 3).value) || undefined;
        assertPortableRowOperation({
          operation: operation as never,
          ...(stableId ? { stableId } : {}),
          ...(expectedResourceVersion ? { expectedResourceVersion } : {}),
        });
        const external = jsonExternalReferences(sheet.getCell(rowNumber, 4).value);
        const relationships = jsonObject(sheet.getCell(rowNumber, 5).value, "relationships");
        const data = Object.fromEntries(
          schema.columns.map((column, index) => {
            const value = sheet.getCell(rowNumber, index + 6).value;
            return [
              column.key,
              value == null ? null : typeof value === "boolean" ? value : String(value),
            ];
          }),
        );
        rows.push({
          rowNumber,
          operation: operation as PortableRowEnvelopeContract["operation"],
          ...(stableId ? { stableId } : {}),
          ...(expectedResourceVersion ? { expectedResourceVersion } : {}),
          externalReferences: external,
          relationships,
          data,
        });
      } catch (error) {
        issues.push(
          issue(
            "ROW_INVALID",
            error instanceof Error ? error.message : String(error),
            `${sheet.name}:${rowNumber}`,
          ),
        );
      }
    }
    parsedSheets.push({
      resourceType: inventory.resourceType,
      sheetName: sheet.name,
      schema,
      dependencyOrder: inventory.dependencyOrder,
      rows,
      sha256: hashPortableRows(rows as never),
    });
  }
  const workbookSha256 = sha256(upload.content);
  const inventory: PortableImportInventory = {
    importId: randomUUID(),
    packageId,
    organizationId: context.organizationId,
    workbookSha256,
    packageHash: source.manifest.packageHash,
    valid: issues.length === 0,
    issues,
    sheets: source.manifest.sheets.map((sheet) => {
      const parsed = parsedSheets.find((x) => x.resourceType === sheet.resourceType);
      return parsed ? { ...sheet, rowCount: parsed.rows.length, sha256: parsed.sha256 } : sheet;
    }),
    parsedSheets,
    ...(!persistedSource
      ? {
          sourcePackage: {
            manifest: embeddedManifest,
            schemas,
            content: upload.content,
            filename: upload.filename,
            mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const,
          },
        }
      : {}),
  };
  return inventory;
}
