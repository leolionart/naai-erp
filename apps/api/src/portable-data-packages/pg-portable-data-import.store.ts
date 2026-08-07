import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import pg from "pg";
import type {
  PortableDryRunResultContract,
  PortableRowEnvelopeContract,
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
import { PortableCanonicalMutationAdapter } from "./portable-canonical-mutation.adapter.js";

@Injectable()
export class PgPortableDataImportStore implements PortableDataImportStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  constructor(
    @Inject(PortableCanonicalMutationAdapter)
    private readonly mutations: PortableCanonicalMutationAdapter,
  ) {}

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
        JSON.stringify(inventory),
        JSON.stringify(inventory.parsedSheets),
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
        JSON.stringify(result),
        JSON.stringify(parsedSheets),
        idempotencyKey,
      ],
    );
    if (!updated.rows[0]) throw new Error("IDEMPOTENCY_CONFLICT");
    return this.record(updated.rows[0]);
  }

  async validateCanonicalRow(
    context: PortableDataPackageContext,
    resourceType: string,
    row: PortableRowEnvelopeContract,
  ): Promise<PortableCanonicalRowValidation> {
    return this.mutations.validate(context, resourceType, row);
  }

  async applyCanonicalRow(
    context: PortableDataPackageContext,
    resourceType: string,
    row: PortableRowEnvelopeContract,
    idempotencyKey: string,
  ): Promise<PortableCanonicalApplyResult> {
    return this.mutations.apply(context, resourceType, row, idempotencyKey);
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
      [context.organizationId, importId, result.committed, JSON.stringify(result), idempotencyKey],
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
