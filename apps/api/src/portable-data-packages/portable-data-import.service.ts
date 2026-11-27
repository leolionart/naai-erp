import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  API_VERSION,
  type PortableDryRunResultContract,
  type PortableDryRunRowResultContract,
} from "@naai-erp/contracts";
import type { PortableDataPackageContext } from "./portable-data-package.types.js";
import {
  PORTABLE_DATA_IMPORT_STORE,
  type EmptyOrganizationRestoreInput,
  type ParsedPortableSheet,
  type PortableDataImportStore,
  type PortableWorkbookUpload,
} from "./portable-data-import.types.js";
import { portableBatchRequiresAtomicService } from "./portable-resource-mutation-matrix.js";
import { IMPORT_ROLES, sha256 } from "./portable-data-import.service.shared.js";
import { parseOperation } from "./portable-data-import-service-parse.operation.js";

@Injectable()
export class PortableDataImportService {
  constructor(@Inject(PORTABLE_DATA_IMPORT_STORE) readonly store: PortableDataImportStore) {}

  envelope(context: PortableDataPackageContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data,
    };
  }

  authorize(context: PortableDataPackageContext) {
    if (!context.roles.some((role) => IMPORT_ROLES.has(role))) throw new Error("FORBIDDEN");
  }

  parse = parseOperation;

  async inventory(
    context: PortableDataPackageContext,
    upload: PortableWorkbookUpload,
    idempotencyKey?: string,
    sourceOrganizationId = context.organizationId,
  ) {
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const parsed = await this.parse(context, upload, sourceOrganizationId);
    return this.envelope(context, await this.store.saveInventory(context, parsed, idempotencyKey));
  }

  async restoreEmptyOrganization(
    context: PortableDataPackageContext,
    input: EmptyOrganizationRestoreInput,
    idempotencyKey?: string,
  ) {
    if (!context.roles.includes("owner")) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (
      input.confirmTargetOrganizationId !== context.organizationId ||
      !input.sourceOrganizationId.trim() ||
      !input.packageId.trim() ||
      !input.reason.trim() ||
      input.mapSourceActorsToTargetActor !== true ||
      !/^[0-9a-f]{64}$/.test(input.workbookSha256)
    )
      throw new Error("VALIDATION_FAILED");
    const content = Buffer.from(input.workbookBase64, "base64");
    if (sha256(content) !== input.workbookSha256) throw new Error("WORKBOOK_SHA256_MISMATCH");
    const parsed = await this.parse(
      context,
      { filename: "portable-restore.xlsx", content },
      input.sourceOrganizationId,
    );
    if (parsed.packageId !== input.packageId) throw new Error("PACKAGE_ID_MISMATCH");
    return this.envelope(
      context,
      await this.store.restoreEmptyOrganization(
        context,
        input.sourceOrganizationId,
        input.packageId,
        input.workbookSha256,
        input.reason.trim(),
        input.mapSourceActorsToTargetActor,
        parsed.parsedSheets,
        idempotencyKey,
      ),
    );
  }

  async dryRun(
    context: PortableDataPackageContext,
    upload: PortableWorkbookUpload,
    idempotencyKey?: string,
    sourceOrganizationId = context.organizationId,
  ) {
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const parsed = await this.parse(context, upload, sourceOrganizationId);
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
      portableBatchRequiresAtomicService(
        mutationRows.map(({ resourceType, row }) => ({ resourceType, operation: row.operation })),
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
