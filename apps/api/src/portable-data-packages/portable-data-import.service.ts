import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  API_VERSION,
  PORTABLE_DATA_PACKAGE_SCHEMA_VERSION,
  type PortableDryRunResultContract,
  type PortableDryRunRowResultContract,
  type PortableDataPackageManifestContract,
  type PortableRowEnvelopeContract,
  type PortableRowIssueContract,
  type PortableSheetInventoryContract,
  type PortableSheetSchemaContract,
} from "@naai-erp/contracts";
import { assertPortableRowOperation, canonicalJson, hashPortableRows } from "@naai-erp/domain";
import ExcelJS from "exceljs";
import type { PortableDataPackageContext } from "./portable-data-package.types.js";
import {
  PORTABLE_DATA_IMPORT_STORE,
  type ParsedPortableSheet,
  type PortableDataImportStore,
  type PortableImportInventory,
  type PortableWorkbookUpload,
} from "./portable-data-import.types.js";
import { portableOperationHasAccountingEffect } from "./portable-resource-mutation-matrix.js";

const IMPORT_ROLES = new Set(["owner", "finance_admin", "accountant"]);
const OPERATIONS = new Set([
  "no_change",
  "create",
  "update",
  "deactivate",
  "cancel",
  "reverse_replace",
]);
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const packageHash = (value: unknown) => sha256(canonicalJson(value as never));
const issue = (code: string, message: string, field?: string): PortableRowIssueContract => ({
  code,
  message,
  ...(field ? { field } : {}),
  severity: "error",
});
const text = (value: ExcelJS.CellValue) => (value == null ? "" : String(value).trim());
const jsonObject = (value: ExcelJS.CellValue, field: string) => {
  const raw = text(value);
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error(`${field} must be a JSON object`);
  return parsed as Record<string, string | null>;
};
const jsonExternalReferences = (value: ExcelJS.CellValue) => {
  const raw = text(value);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("externalReferences must be a JSON array");
  return parsed.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      throw new Error("externalReferences entries must be objects");
    const system = String((entry as Record<string, unknown>).system ?? "").trim();
    const externalId = String((entry as Record<string, unknown>).externalId ?? "").trim();
    if (!system || !externalId)
      throw new Error("externalReferences entries require system and externalId");
    return { system, externalId };
  });
};

@Injectable()
export class PortableDataImportService {
  constructor(
    @Inject(PORTABLE_DATA_IMPORT_STORE) private readonly store: PortableDataImportStore,
  ) {}

  private envelope(context: PortableDataPackageContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data,
    };
  }

  private authorize(context: PortableDataPackageContext) {
    if (!context.roles.some((role) => IMPORT_ROLES.has(role))) throw new Error("FORBIDDEN");
  }

  private async parse(context: PortableDataPackageContext, upload: PortableWorkbookUpload) {
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
    if (values.get("organization_id") !== context.organizationId)
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
      organizationId: context.organizationId,
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
    };
    return inventory;
  }

  async inventory(
    context: PortableDataPackageContext,
    upload: PortableWorkbookUpload,
    idempotencyKey?: string,
  ) {
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const parsed = await this.parse(context, upload);
    return this.envelope(context, await this.store.saveInventory(context, parsed, idempotencyKey));
  }

  async dryRun(
    context: PortableDataPackageContext,
    upload: PortableWorkbookUpload,
    idempotencyKey?: string,
  ) {
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const parsed = await this.parse(context, upload);
    await this.store.saveInventory(context, parsed, `${idempotencyKey}:inventory`);
    const rows: PortableDryRunRowResultContract[] = [];
    for (const sheet of parsed.parsedSheets)
      for (const row of sheet.rows) {
        if (row.operation === "no_change") {
          rows.push({
            sheetName: sheet.sheetName,
            resourceType: sheet.resourceType,
            rowNumber: row.rowNumber,
            ...(row.stableId ? { stableId: row.stableId } : {}),
            operation: row.operation,
            disposition: "unchanged",
            issues: [],
            resolvedReferences: {},
          });
          continue;
        }
        const validation = await this.store.validateCanonicalRow(context, sheet.resourceType, row);
        rows.push({
          sheetName: sheet.sheetName,
          resourceType: sheet.resourceType,
          rowNumber: row.rowNumber,
          ...(row.stableId ? { stableId: row.stableId } : {}),
          operation: row.operation,
          disposition: validation.disposition,
          issues: validation.issues ?? [],
          resolvedReferences: validation.resolvedReferences ?? {},
        });
      }
    const invalidInventoryRows: PortableDryRunRowResultContract[] = parsed.issues.map(
      (item, index) => ({
        sheetName: "_manifest",
        resourceType: "package",
        rowNumber: index + 1,
        operation: "no_change",
        disposition: "invalid",
        issues: [item],
        resolvedReferences: {},
      }),
    );
    rows.push(...invalidInventoryRows);
    const count = (value: PortableDryRunRowResultContract["disposition"]) =>
      rows.filter((row) => row.disposition === value).length;
    const result: PortableDryRunResultContract = {
      schemaVersion: 1,
      packageId: parsed.packageId,
      organizationId: context.organizationId,
      packageHash: parsed.packageHash,
      dryRun: true,
      mutationCount: 0,
      valid: parsed.valid && count("invalid") === 0 && count("conflict") === 0,
      totals: {
        sheets: parsed.parsedSheets.length,
        rows: rows.length,
        ready: count("ready"),
        invalid: count("invalid"),
        conflicts: count("conflict"),
        unchanged: count("unchanged"),
      },
      sheetInventory: parsed.sheets,
      rows,
    };
    const dryRunId = randomUUID();
    return this.envelope(
      context,
      await this.store.saveDryRun(
        context,
        parsed.importId,
        dryRunId,
        result,
        parsed.parsedSheets,
        idempotencyKey,
      ),
    );
  }

  async status(context: PortableDataPackageContext, importId: string) {
    this.authorize(context);
    const record = await this.store.getImport(context, importId);
    if (!record) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(context, record);
  }

  async commit(
    context: PortableDataPackageContext,
    importId: string,
    input: Record<string, unknown>,
    idempotencyKey?: string,
  ) {
    this.authorize(context);
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const record = await this.store.getImport(context, importId);
    if (!record) throw new Error("RESOURCE_NOT_FOUND");
    if (
      !record.dryRun?.valid ||
      record.dryRunId !== input.dryRunId ||
      record.workbookSha256 !== input.workbookSha256
    )
      throw new Error("PORTABLE_IMPORT_COMMIT_PRECONDITION_FAILED");
    const dryRunId = record.dryRunId;
    if (!dryRunId) throw new Error("PORTABLE_IMPORT_COMMIT_PRECONDITION_FAILED");
    const parsedSheets = (
      record as typeof record & { parsedSheets?: readonly ParsedPortableSheet[] }
    ).parsedSheets;
    if (!parsedSheets) throw new Error("PORTABLE_IMPORT_STAGED_ROWS_MISSING");
    const mutationRows = parsedSheets.flatMap((sheet) =>
      sheet.rows
        .filter((row) => row.operation !== "no_change")
        .map((row) => ({ resourceType: sheet.resourceType, row })),
    );
    if (
      mutationRows.length > 1 &&
      mutationRows.some(({ resourceType, row }) =>
        portableOperationHasAccountingEffect(resourceType, row.operation),
      )
    )
      throw new Error("PORTABLE_IMPORT_ATOMIC_BATCH_UNAVAILABLE");
    for (const { resourceType, row } of mutationRows) {
      const validation = await this.store.validateCanonicalRow(context, resourceType, row);
      if (validation.disposition !== "ready")
        throw new Error("PORTABLE_IMPORT_COMMIT_REVALIDATION_FAILED");
    }
    const resultRows: PortableDryRunRowResultContract[] = [];
    let applied = 0,
      unchanged = 0,
      failed = 0;
    for (const sheet of [...parsedSheets].sort((a, b) => a.dependencyOrder - b.dependencyOrder))
      for (const row of sheet.rows) {
        if (row.operation === "no_change") {
          unchanged += 1;
          continue;
        }
        const outcome = await this.store.applyCanonicalRow(
          context,
          sheet.resourceType,
          row,
          `${idempotencyKey}:${sheet.resourceType}:${row.rowNumber}`,
        );
        if (outcome.applied) applied += 1;
        else {
          failed += 1;
          resultRows.push({
            sheetName: sheet.sheetName,
            resourceType: sheet.resourceType,
            rowNumber: row.rowNumber,
            ...(row.stableId ? { stableId: row.stableId } : {}),
            operation: row.operation,
            disposition: "invalid",
            issues: [outcome.issue],
            resolvedReferences: {},
          });
        }
      }
    const result = {
      importId,
      dryRunId,
      workbookSha256: record.workbookSha256,
      committed: failed === 0,
      applied,
      unchanged,
      failed,
      rows: resultRows,
    };
    return this.envelope(
      context,
      await this.store.saveCommit(context, importId, result, idempotencyKey),
    );
  }
}
