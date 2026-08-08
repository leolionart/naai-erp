import { createHash, randomUUID } from "node:crypto";
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
import { MASTER_DATA_RESOURCES } from "../master-data/resource-registry.js";

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
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const existingPackage = await client.query(
        `select package_hash,content_hash from portable_data_packages
         where organization_id=$1 and id=$2 for update`,
        [context.organizationId, inventory.packageId],
      );
      const existing = existingPackage.rows[0];
      if (existing) {
        if (
          String(existing.package_hash) !== inventory.packageHash ||
          String(existing.content_hash) !== inventory.workbookSha256
        )
          throw new Error("PORTABLE_IMPORT_PACKAGE_HASH_MISMATCH");
      } else {
        const source = inventory.sourcePackage;
        if (!source) throw new Error("PORTABLE_IMPORT_SOURCE_PACKAGE_MISSING");
        if (
          source.manifest.packageId !== inventory.packageId ||
          source.manifest.packageHash !== inventory.packageHash ||
          source.manifest.workbookSha256 !== inventory.workbookSha256
        )
          throw new Error("PORTABLE_IMPORT_PACKAGE_HASH_MISMATCH");
        await client.query(
          `insert into portable_data_packages
           (organization_id,id,schema_version,as_of,format,manifest,schemas,content,content_hash,
            package_hash,size_bytes,media_type,filename,idempotency_key,request_hash,generated_by,
            correlation_id,generated_at)
           values($1,$2,$3,$4,'xlsx',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [
            context.organizationId,
            inventory.packageId,
            source.manifest.schemaVersion,
            source.manifest.asOf,
            JSON.stringify(source.manifest),
            JSON.stringify(source.schemas),
            source.content,
            inventory.workbookSha256,
            inventory.packageHash,
            source.content.length,
            source.mediaType,
            source.filename,
            `external-import:${inventory.packageId}`,
            inventory.workbookSha256,
            source.manifest.exportedBy,
            context.correlationId,
            source.manifest.exportedAt,
          ],
        );
      }
      const result = await client.query(
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
          JSON.stringify({ ...inventory, sourcePackage: undefined }),
          JSON.stringify(inventory.parsedSheets),
          idempotencyKey,
          context.actorId,
          context.correlationId,
        ],
      );
      const saved = this.record(result.rows[0]);
      if (
        saved.workbookSha256 !== inventory.workbookSha256 ||
        saved.packageHash !== inventory.packageHash ||
        saved.packageId !== inventory.packageId
      )
        throw new Error("IDEMPOTENCY_CONFLICT");
      await client.query("commit");
      return saved;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
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

  async restoreEmptyOrganization(
    context: PortableDataPackageContext,
    sourceOrganizationId: string,
    packageId: string,
    workbookSha256: string,
    reason: string,
    _mapSourceActorsToTargetActor: true,
    parsedSheets: readonly ParsedPortableSheet[],
    idempotencyKey: string,
  ) {
    const excluded = new Set([
      "organizations",
      "organization_memberships",
      "membership_roles",
      "api_credentials",
      "api_idempotency_records",
      "portable_data_packages",
      "portable_data_imports",
      "outbox_events",
      "outbound_deliveries",
      "outbound_delivery_attempts",
    ]);
    const tableNameOf = (sheet: ParsedPortableSheet): string =>
      MASTER_DATA_RESOURCES[sheet.resourceType as keyof typeof MASTER_DATA_RESOURCES]?.table ??
      sheet.resourceType;
    const sheets = parsedSheets.filter(
      (sheet) =>
        !excluded.has(tableNameOf(sheet)) &&
        !tableNameOf(sheet).startsWith("evidence_") &&
        sheet.rows.length > 0,
    );
    const packageContentHash = createHash("sha256")
      .update(
        JSON.stringify(sheets.map((sheet) => [sheet.sheetName, sheet.sha256, sheet.rows.length])),
      )
      .digest("hex");
    const normalized = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(normalized)
        : typeof value === "number" || typeof value === "bigint"
          ? String(value)
          : typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)
            ? new Date(value).toISOString()
            : typeof value === "string" && /^-?\d+\.\d+$/.test(value)
              ? value.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1")
              : typeof value === "string" &&
                  ["[", "{"].some((prefix) => value.trim().startsWith(prefix))
                ? (() => {
                    try {
                      return normalized(JSON.parse(value));
                    } catch {
                      return value;
                    }
                  })()
                : value && typeof value === "object"
                  ? Object.fromEntries(
                      Object.entries(value as Record<string, unknown>)
                        .sort(([left], [right]) => left.localeCompare(right))
                        .map(([key, nested]) => [key, normalized(nested)]),
                    )
                  : value;
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `restore:${context.organizationId}:${idempotencyKey}`,
      ]);
      const replay = await client.query<{
        request_hash: string;
        response_body: Record<string, unknown>;
      }>(
        "select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2",
        [context.organizationId, idempotencyKey],
      );
      const requestHash = createHash("sha256")
        .update(
          JSON.stringify({
            sourceOrganizationId,
            packageId,
            workbookSha256,
            reason,
            packageContentHash,
          }),
        )
        .digest("hex");
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
        await client.query("rollback");
        return { ...replay.rows[0].response_body, idempotencyReplayed: true } as never;
      }
      for (const sheet of sheets) {
        const present = await client.query<{ count: number }>(
          `select count(*)::int count from "${tableNameOf(sheet).replaceAll('"', '""')}" where organization_id=$1`,
          [context.organizationId],
        );
        if ((present.rows[0]?.count ?? 0) > 0) throw new Error("RESTORE_TARGET_NOT_EMPTY");
      }
      const tableNames = sheets.map(tableNameOf);
      const dependencies = await client.query<{ table_name: string; referenced_table: string }>(
        `select tc.table_name,ccu.table_name referenced_table
         from information_schema.table_constraints tc
         join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name and ccu.constraint_schema=tc.constraint_schema
         where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public' and tc.table_name=any($1::text[])`,
        [tableNames],
      );
      const pending = new Map<string, ParsedPortableSheet>(
        sheets.map((sheet) => [tableNameOf(sheet), sheet]),
      );
      const ordered: ParsedPortableSheet[] = [];
      while (pending.size) {
        const ready = [...pending.values()].filter((sheet) =>
          dependencies.rows.every(
            (dep) =>
              dep.table_name !== tableNameOf(sheet) ||
              dep.referenced_table === tableNameOf(sheet) ||
              !pending.has(dep.referenced_table),
          ),
        );
        if (!ready.length) throw new Error("RESTORE_DEPENDENCY_CYCLE");
        for (const sheet of ready) {
          ordered.push(sheet);
          pending.delete(tableNameOf(sheet));
        }
      }
      const restoredByResource: Record<string, number> = {};
      const sourceActorIds = new Set<string>();
      const expectedByTable = new Map<string, Record<string, unknown>[]>();
      const dateKeysByTable = new Map<string, Set<string>>(
        sheets.map((sheet) => [
          tableNameOf(sheet),
          new Set(
            sheet.schema.columns
              .filter((column) => column.type === "date")
              .map((column) => column.key),
          ),
        ]),
      );
      const normalizeRecordDates = (table: string, record: Record<string, unknown>) =>
        Object.fromEntries(
          Object.entries(record).map(([key, value]) => [
            key,
            dateKeysByTable.get(table)?.has(key) && typeof value === "string"
              ? value.slice(0, 10)
              : value,
          ]),
        );
      for (const sheet of ordered) {
        const tableName = tableNameOf(sheet);
        const table = `"${tableName.replaceAll('"', '""')}"`;
        const columns = await client.query<{ column_name: string }>(
          "select column_name from information_schema.columns where table_schema='public' and table_name=$1",
          [tableName],
        );
        const hasId = columns.rows.some((column) => column.column_name === "id");
        const hasVersion = columns.rows.some((column) => column.column_name === "version");
        const jsonKeys = new Set(
          sheet.schema.columns
            .filter((column) => column.type === "json")
            .map((column) => column.key),
        );
        for (const row of sheet.rows) {
          const record: Record<string, unknown> = {
            organization_id: context.organizationId,
            ...Object.fromEntries(
              Object.entries(row.data).map(([key, value]) => [
                key,
                jsonKeys.has(key) && typeof value === "string" ? JSON.parse(value) : value,
              ]),
            ),
            ...row.relationships,
          };
          delete record.lines;
          for (const [key, value] of Object.entries(record))
            if (
              value != null &&
              /(^actor_id$|_user_id$|_by$)/.test(key) &&
              key !== "organization_id"
            ) {
              sourceActorIds.add(String(value));
              record[key] = context.actorId;
            }
          if (hasId && row.stableId && !("id" in record)) record.id = row.stableId;
          if (hasVersion && !("version" in record))
            record.version = row.expectedResourceVersion ?? null;
          const expected = { ...record };
          delete expected.organization_id;
          const expectedRows = expectedByTable.get(tableName) ?? [];
          expectedRows.push(normalizeRecordDates(tableName, expected));
          expectedByTable.set(tableName, expectedRows);
          await client.query(
            `insert into ${table} select * from jsonb_populate_record(null::${table},$1::jsonb)`,
            [JSON.stringify(record)],
          );
        }
        restoredByResource[sheet.resourceType] = sheet.rows.length;
      }
      const sourceHash = createHash("sha256")
        .update(
          JSON.stringify(
            normalized(
              [...expectedByTable.entries()]
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([table, rows]) => [
                  table,
                  rows
                    .map(normalized)
                    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
                ]),
            ),
          ),
        )
        .digest("hex");
      const targetReadback: unknown[] = [];
      const mismatchedTables: string[] = [];
      for (const [tableName, expectedRows] of [...expectedByTable.entries()].sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        const table = `"${tableName.replaceAll('"', '""')}"`;
        const rows = await client.query<{ row: Record<string, unknown> }>(
          `select to_jsonb(t)-'organization_id' row from ${table} t where organization_id=$1 order by (to_jsonb(t)-'organization_id')::text`,
          [context.organizationId],
        );
        if (rows.rows.length !== expectedRows.length) throw new Error("RESTORE_COUNT_MISMATCH");
        const normalizedTargetRows = rows.rows
          .map((item) => normalized(normalizeRecordDates(tableName, item.row)))
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        const normalizedExpectedRows = expectedRows
          .map(normalized)
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        if (JSON.stringify(normalizedExpectedRows) !== JSON.stringify(normalizedTargetRows))
          mismatchedTables.push(tableName);
        targetReadback.push([tableName, normalizedTargetRows]);
      }
      const targetHash = createHash("sha256")
        .update(JSON.stringify(normalized(targetReadback)))
        .digest("hex");
      if (targetHash !== sourceHash)
        throw new Error(`RESTORE_HASH_MISMATCH:${mismatchedTables.join(",")}`);
      const balance = await client.query<{ total: number; unbalanced: number }>(
        `select count(*)::int total,
          count(*) filter(where coalesce(x.debit,0)<>coalesce(x.credit,0))::int unbalanced
         from journal_entries j left join lateral (
           select sum(coalesce(debit_minor,0)) debit,sum(coalesce(credit_minor,0)) credit
           from journal_lines l where l.organization_id=j.organization_id and l.journal_id=j.id
         ) x on true where j.organization_id=$1 and j.state in ('posted','reversed')`,
        [context.organizationId],
      );
      if ((balance.rows[0]?.unbalanced ?? 0) > 0) throw new Error("RESTORE_JOURNAL_UNBALANCED");
      const auditEventId = randomUUID();
      const restoredRows = Object.values(restoredByResource).reduce((sum, value) => sum + value, 0);
      const response = {
        sourceOrganizationId,
        targetOrganizationId: context.organizationId,
        packageId,
        workbookSha256,
        restoredRows,
        restoredByResource,
        sourceHash,
        targetHash,
        balancedJournalCount: balance.rows[0]?.total ?? 0,
        auditEventId,
        idempotencyReplayed: false,
      };
      await client.query(
        `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state)
         values($1,$2,'portable_data_import',$3,1,'empty_tenant_restore',$4,$5,$6)`,
        [
          context.organizationId,
          auditEventId,
          packageId,
          context.actorId,
          context.correlationId,
          {
            ...response,
            actorMapping: {
              sourceActorIds: [...sourceActorIds].sort(),
              targetActorId: context.actorId,
            },
          },
        ],
      );
      await client.query(
        "insert into api_idempotency_records(organization_id,idempotency_key,operation,request_hash,response_body) values($1,$2,'portable-data:restore-empty',$3,$4)",
        [context.organizationId, idempotencyKey, requestHash, response],
      );
      await client.query("commit");
      return response;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
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
