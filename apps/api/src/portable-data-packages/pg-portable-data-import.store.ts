import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import pg from "pg";
import { MasterDataService } from "../master-data/master-data.service.js";
import { MASTER_DATA_RESOURCES, encodeResourceKey } from "../master-data/resource-registry.js";
import type {
  PortableDryRunResultContract,
  PortableRowEnvelopeContract,
  PortableRowIssueContract,
} from "@naai-erp/contracts";
import type { PortableDataPackageContext } from "./portable-data-package.types.js";
import type {
  ParsedPortableSheet,
  PortableCanonicalApplyResult,
  PortableCanonicalRowValidation,
  PortableDataImportStore,
  PortableImportCommitResult,
  PortableImportInventory,
  PortableImportRecord,
} from "./portable-data-import.types.js";

const errorIssue = (code: string, message: string, field?: string): PortableRowIssueContract => ({
  code,
  message,
  ...(field ? { field } : {}),
  severity: "error",
});

@Injectable()
export class PgPortableDataImportStore implements PortableDataImportStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  constructor(@Inject(MasterDataService) private readonly masterData: MasterDataService) {}

  async getSourcePackage(context: PortableDataPackageContext, packageId: string) {
    const result = await this.pool.query(
      `select manifest,schemas from portable_data_packages where organization_id=$1 and id=$2`,
      [context.organizationId, packageId],
    );
    const row = result.rows[0];
    return row ? { manifest: row.manifest, schemas: row.schemas } : undefined;
  }

  private record(row: Record<string, unknown>): PortableImportRecord & {
    parsedSheets?: readonly ParsedPortableSheet[];
  } {
    return {
      importId: String(row.id),
      packageId: String(row.package_id),
      organizationId: String(row.organization_id),
      state: row.state as PortableImportRecord["state"],
      workbookSha256: String(row.workbook_sha256),
      packageHash: String(row.package_hash),
      ...(row.dry_run_id ? { dryRunId: String(row.dry_run_id) } : {}),
      ...(row.dry_run
        ? { dryRun: row.dry_run as NonNullable<PortableImportRecord["dryRun"]> }
        : {}),
      ...(row.commit_result
        ? { commitResult: row.commit_result as PortableImportCommitResult }
        : {}),
      ...(row.parsed_sheets
        ? { parsedSheets: row.parsed_sheets as readonly ParsedPortableSheet[] }
        : {}),
    };
  }

  async saveInventory(
    context: PortableDataPackageContext,
    inventory: PortableImportInventory,
    idempotencyKey: string,
  ) {
    const result = await this.pool.query(
      `insert into portable_data_imports
       (organization_id,id,package_id,state,workbook_sha256,package_hash,inventory,parsed_sheets,inventory_idempotency_key,actor_id,correlation_id)
       values($1,$2,$3,'inventoried',$4,$5,$6,$7,$8,$9,$10)
       on conflict (organization_id,inventory_idempotency_key) do update
       set updated_at=portable_data_imports.updated_at
       returning *`,
      [
        context.organizationId,
        inventory.importId,
        inventory.packageId,
        inventory.workbookSha256,
        inventory.packageHash,
        inventory,
        inventory.parsedSheets,
        idempotencyKey,
        context.actorId,
        context.correlationId,
      ],
    );
    const saved = this.record(result.rows[0]);
    if (saved.workbookSha256 !== inventory.workbookSha256) throw new Error("IDEMPOTENCY_CONFLICT");
    return saved;
  }

  async getImport(context: PortableDataPackageContext, importId: string) {
    const result = await this.pool.query(
      `select * from portable_data_imports where organization_id=$1 and id=$2`,
      [context.organizationId, importId],
    );
    return result.rows[0] ? this.record(result.rows[0]) : undefined;
  }

  async saveDryRun(
    context: PortableDataPackageContext,
    importId: string,
    dryRunId: string,
    result: PortableDryRunResultContract,
    parsedSheets: readonly ParsedPortableSheet[],
    idempotencyKey: string,
  ) {
    const updated = await this.pool.query(
      `update portable_data_imports
       set state=$3,dry_run_id=$4,dry_run=$5,parsed_sheets=$6,dry_run_idempotency_key=$7,updated_at=now()
       where organization_id=$1 and id=$2
         and (dry_run_idempotency_key is null or dry_run_idempotency_key=$7)
       returning *`,
      [
        context.organizationId,
        importId,
        result?.valid ? "dry_run_valid" : "dry_run_invalid",
        dryRunId,
        result,
        parsedSheets,
        idempotencyKey,
      ],
    );
    if (!updated.rows[0]) throw new Error("IDEMPOTENCY_CONFLICT");
    return this.record(updated.rows[0]);
  }

  private definition(resourceType: string) {
    return MASTER_DATA_RESOURCES[resourceType as keyof typeof MASTER_DATA_RESOURCES];
  }

  private payload(row: PortableRowEnvelopeContract) {
    return { ...row.data, ...row.relationships } as Record<string, unknown>;
  }

  async validateCanonicalRow(
    context: PortableDataPackageContext,
    resourceType: string,
    row: PortableRowEnvelopeContract,
  ): Promise<PortableCanonicalRowValidation> {
    const definition = this.definition(resourceType);
    if (!definition)
      return {
        disposition: "invalid",
        issues: [
          errorIssue(
            "READ_ONLY_RESOURCE",
            `${resourceType} is exported for traceability but has no portable mutation adapter`,
          ),
        ],
      };
    if (row.operation === "cancel" || row.operation === "reverse_replace")
      return {
        disposition: "invalid",
        issues: [
          errorIssue(
            "LIFECYCLE_ADAPTER_REQUIRED",
            `${row.operation} requires the resource-specific canonical lifecycle service`,
          ),
        ],
      };
    if (row.operation === "deactivate" && !("deactivate" in definition))
      return {
        disposition: "invalid",
        issues: [errorIssue("DEACTIVATION_UNSUPPORTED", `${resourceType} cannot be deactivated`)],
      };
    const dryRun = this.masterData.dryRunImport(resourceType, context, [this.payload(row)]).data!;
    const errors = dryRun.rows[0]?.errors ?? [];
    return errors.length
      ? {
          disposition: "invalid",
          issues: errors.map((message) => errorIssue("FIELD_INVALID", message)),
        }
      : { disposition: "ready", resolvedReferences: row.relationships as Record<string, string> };
  }

  async applyCanonicalRow(
    context: PortableDataPackageContext,
    resourceType: string,
    row: PortableRowEnvelopeContract,
    idempotencyKey: string,
  ): Promise<PortableCanonicalApplyResult> {
    const validation = await this.validateCanonicalRow(context, resourceType, row);
    if (validation.disposition !== "ready")
      return {
        applied: false,
        issue: validation.issues?.[0] ?? errorIssue("ROW_INVALID", "Row is not ready"),
      };
    const definition = this.definition(resourceType)!;
    const data = this.payload(row);
    const keyValues = Object.fromEntries(
      definition.keyColumns.map((key) => [
        key,
        data[key] ?? (key === "id" ? row.stableId : undefined),
      ]),
    );
    if (Object.values(keyValues).some((value) => value == null || value === ""))
      return {
        applied: false,
        issue: errorIssue("KEY_MISSING", "Resource key fields are required"),
      };
    const action =
      row.operation === "create"
        ? "create"
        : row.operation === "deactivate"
          ? "deactivate"
          : "update";
    try {
      const response = await this.masterData.mutate(
        action,
        resourceType,
        action === "create" ? undefined : encodeResourceKey(keyValues),
        context,
        {
          data,
          ...(row.expectedResourceVersion ? { expectedVersion: row.expectedResourceVersion } : {}),
        },
        idempotencyKey,
      );
      const resource = response.data!.resource;
      const stableId = String(resource.id ?? row.stableId ?? "");
      return stableId ? { applied: true, stableId } : { applied: true };
    } catch (error) {
      return {
        applied: false,
        issue: errorIssue(
          "CANONICAL_MUTATION_FAILED",
          error instanceof Error ? error.message : String(error),
        ),
      };
    }
  }

  async saveCommit(
    context: PortableDataPackageContext,
    importId: string,
    result: PortableImportCommitResult,
    idempotencyKey: string,
  ) {
    const updated = await this.pool.query(
      `update portable_data_imports
       set state=case when $3::boolean then 'committed' else state end,
           commit_result=$4,commit_idempotency_key=$5,updated_at=now()
       where organization_id=$1 and id=$2
         and (commit_idempotency_key is null or commit_idempotency_key=$5)
       returning *`,
      [context.organizationId, importId, result.committed, result, idempotencyKey],
    );
    if (!updated.rows[0]) throw new Error("IDEMPOTENCY_CONFLICT");
    await this.pool.query(
      `insert into resource_audit_events
       (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state)
       values($1,$2,'portable_data_import',$3,1,'import_commit',$4,$5,$6)`,
      [
        context.organizationId,
        randomUUID(),
        importId,
        context.actorId,
        context.correlationId,
        result,
      ],
    );
    return this.record(updated.rows[0]);
  }
}
