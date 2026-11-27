import { createHash, randomUUID } from "node:crypto";
import {
  PORTABLE_DATA_PACKAGE_SCHEMA_VERSION,
  type PortableRowEnvelopeContract,
  type PortableSheetColumnContract,
} from "@naai-erp/contracts";
import type {
  PortableDataPackageContext,
  LocalOrganizationResetInput,
  LocalOrganizationResetResult,
  PortableResourceExport,
} from "./portable-data-package.types.js";
import { portableMutationEntry } from "./portable-resource-mutation-matrix.js";
import {
  BINARY_TYPES,
  DATE_COLUMNS,
  EXCLUDED_RESOURCES,
  LOCAL_RESET_PRESERVE,
  MASTER_RESOURCE_BY_TABLE,
  SECRET_COLUMN,
  canonical,
  cellType,
  quote,
  quoteIdentifier,
  scalar,
  sha,
} from "./pg-portable-data-package.store.shared.js";
import type { PgPortableDataPackageStore } from "./pg-portable-data-package.store.js";

export async function collectOrganizationResourcesOperation(
  this: PgPortableDataPackageStore,
  context: PortableDataPackageContext,
  asOf: string,
): Promise<readonly PortableResourceExport[]> {
  const resources: PortableResourceExport[] = [];
  for (const [tableName, sourceColumns] of await this.columnInventory()) {
    const resourceType = MASTER_RESOURCE_BY_TABLE.get(tableName) ?? tableName;
    const excludedReason =
      EXCLUDED_RESOURCES[tableName] ??
      (tableName.startsWith("evidence_") ||
      sourceColumns.some((column) => BINARY_TYPES.has(column.udt_name))
        ? "Paperless owns source files; binary/evidence payload tables are intentionally not restored"
        : undefined);
    if (excludedReason) {
      resources.push({
        inventory: {
          resourceType,
          excluded: true,
          exclusionReason: excludedReason,
          schemaVersion: PORTABLE_DATA_PACKAGE_SCHEMA_VERSION,
          dependencyOrder: 10_000,
          mutability: "read_only",
        },
      });
      continue;
    }
    const columns = sourceColumns.filter(
      (column) => !SECRET_COLUMN.test(column.column_name) && !BINARY_TYPES.has(column.udt_name),
    );
    const names = columns.map((column) => column.column_name);
    const cutoffColumn = DATE_COLUMNS.find((name) => names.includes(name));
    const organizationPredicate =
      tableName === "organizations" ? `"id"=$1` : `"organization_id"=$1`;
    const parameters: unknown[] = [context.organizationId];
    let cutoffPredicate = "";
    if (cutoffColumn) {
      parameters.push(`${asOf}T23:59:59.999Z`);
      cutoffPredicate = ` and ${quote(cutoffColumn)} <= $2::timestamptz`;
    }
    const result = await this.pool.query<Record<string, unknown>>(
      `select ${names.map(quote).join(",")} from ${quote(tableName)}
       where ${organizationPredicate}${cutoffPredicate}
       order by to_jsonb(${quote(tableName)})::text`,
      parameters,
    );
    const relationshipKeys = names.filter(
      (name) => name.endsWith("_id") && name !== "organization_id" && name !== "id",
    );
    const stableKeys = names.includes("id")
      ? ["id"]
      : names.filter((name) => name !== "organization_id" && !relationshipKeys.includes(name));
    const dataColumns = columns.filter(
      (column) =>
        column.column_name !== "organization_id" &&
        !relationshipKeys.includes(column.column_name) &&
        column.column_name !== "id" &&
        column.column_name !== "version",
    );
    if (["commercial_documents", "expenses"].includes(tableName))
      dataColumns.push({
        table_name: tableName,
        column_name: "lines",
        data_type: "jsonb",
        udt_name: "jsonb",
        is_nullable: "NO",
        ordinal_position: 100_000,
      });
    const mutation = portableMutationEntry(resourceType);
    const mutability = ["commercial_document", "expense", "journal"].includes(mutation.adapter)
      ? "correction_only"
      : mutation.operations.includes("create") || mutation.operations.includes("update")
        ? "editable"
        : mutation.operations.includes("deactivate")
          ? "deactivate_only"
          : "read_only";
    const sheetColumns: PortableSheetColumnContract[] = dataColumns.map((column) => ({
      key: column.column_name,
      header: column.column_name,
      type: cellType(column),
      required: column.is_nullable === "NO",
      editable: false,
      description: "Canonical exported value; mutation requires the matching application service",
    }));
    const enrichedRows: Record<string, unknown>[] = await Promise.all(
      result.rows.map(async (row) => ({
        ...row,
        ...(["commercial_documents", "expenses"].includes(tableName)
          ? {
              lines: await this.portableLines(tableName, context.organizationId, String(row.id)),
              __externalReferences: await this.portableExternalReferences(
                tableName,
                context.organizationId,
                String(row.id),
              ),
            }
          : {}),
      })),
    );
    const rows: PortableRowEnvelopeContract[] = enrichedRows.map((r, index) => {
      const row = r as Record<string, unknown>;
      return {
        rowNumber: index + 2,
        operation: "no_change",
        stableId: names.includes("id")
          ? String(row.id)
          : sha(canonical(stableKeys.map((key) => row[key]))),
        externalReferences: (row.__externalReferences ??
          []) as PortableRowEnvelopeContract["externalReferences"],
        ...(names.includes("version") && row.version != null
          ? { expectedResourceVersion: String(row.version) }
          : {}),
        data: Object.fromEntries(
          dataColumns.map((column) => [column.column_name, scalar(row[column.column_name])]),
        ),
        relationships: Object.fromEntries(
          relationshipKeys.map((key) => [key, row[key] == null ? null : String(row[key])]),
        ),
      };
    });
    resources.push({
      inventory: {
        resourceType,
        sheetName: tableName,
        excluded: false,
        schemaVersion: PORTABLE_DATA_PACKAGE_SCHEMA_VERSION,
        dependencyOrder:
          tableName === "organizations"
            ? 0
            : tableName === "service_plans"
              ? 45
              : tableName === "customer_service_subscriptions"
                ? 65
                : 100,
        mutability,
      },
      schema: {
        resourceType,
        sheetName: tableName,
        schemaVersion: PORTABLE_DATA_PACKAGE_SCHEMA_VERSION,
        stableIdColumn: "stableId",
        ...(names.includes("version") ? { resourceVersionColumn: "expectedResourceVersion" } : {}),
        operationColumn: "operation",
        columns: sheetColumns.map((column) => ({
          ...column,
          editable:
            mutability === "editable" ||
            (mutability === "correction_only" &&
              !["state", "journal_id", "posted_at"].includes(column.key)),
        })),
      },
      rows,
    });
  }
  return resources;
}

export async function resetLocalOrganizationOperation(
  this: PgPortableDataPackageStore,
  context: PortableDataPackageContext,
  input: LocalOrganizationResetInput,
  idempotencyKey: string,
): Promise<LocalOrganizationResetResult> {
  const operation = "portable-data-package:local-organization-reset";
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const client = await this.pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${context.organizationId}:${operation}`,
    ]);
    const replay = await client.query<{
      request_hash: string;
      response_body: LocalOrganizationResetResult;
    }>(
      `select request_hash,response_body from api_idempotency_records
       where organization_id=$1 and idempotency_key=$2 for update`,
      [context.organizationId, idempotencyKey],
    );
    if (replay.rows[0]) {
      if (replay.rows[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
      await client.query("commit");
      return { ...replay.rows[0].response_body, idempotencyReplayed: true };
    }
    const backup = await client.query<{
      content_hash: string;
      manifest: {
        organizationId?: string;
        workbookSha256?: string;
        sheets?: unknown[];
        totalSheetCount?: number;
      };
      content: Buffer;
      size_bytes: string;
    }>(
      `select content_hash,manifest,content,size_bytes::text size_bytes
       from portable_data_packages where organization_id=$1 and id=$2 for update`,
      [context.organizationId, input.packageId],
    );
    const packageRow = backup.rows[0];
    if (!packageRow) throw new Error("BACKUP_PACKAGE_NOT_FOUND");
    const manifest = packageRow.manifest;
    if (
      packageRow.content_hash !== input.workbookSha256 ||
      manifest.workbookSha256 !== input.workbookSha256 ||
      manifest.organizationId !== context.organizationId
    )
      throw new Error("BACKUP_CHECKSUM_MISMATCH");
    if (
      !packageRow.content?.length ||
      Number(packageRow.size_bytes) !== packageRow.content.length ||
      !Array.isArray(manifest.sheets) ||
      manifest.sheets.length === 0 ||
      manifest.totalSheetCount !==
        manifest.sheets.filter(
          (sheet) =>
            Boolean(sheet) &&
            typeof sheet === "object" &&
            !(sheet as { excluded?: boolean }).excluded,
        ).length
    )
      throw new Error("BACKUP_PACKAGE_INCOMPLETE");

    const catalog = await client.query<{ table_name: string }>(
      `select distinct table_name from information_schema.columns
       where table_schema='public' and column_name='organization_id' order by table_name`,
    );
    const tables = catalog.rows
      .map((row) => row.table_name)
      .filter((table) => !LOCAL_RESET_PRESERVE.has(table));
    const dependencies = await client.query<{ child_table: string; parent_table: string }>(
      `select child.relname child_table,parent.relname parent_table
       from pg_constraint fk
       join pg_class child on child.oid=fk.conrelid
       join pg_class parent on parent.oid=fk.confrelid
       join pg_namespace ns on ns.oid=child.relnamespace
       where fk.contype='f' and ns.nspname='public'`,
    );
    const tableSet = new Set(tables);
    const children = new Map<string, Set<string>>();
    for (const edge of dependencies.rows) {
      if (!tableSet.has(edge.child_table) || !tableSet.has(edge.parent_table)) continue;
      const list = children.get(edge.parent_table) ?? new Set<string>();
      list.add(edge.child_table);
      children.set(edge.parent_table, list);
    }
    const ordered: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const visit = (table: string) => {
      if (visited.has(table) || visiting.has(table)) return;
      visiting.add(table);
      for (const child of children.get(table) ?? []) visit(child);
      visiting.delete(table);
      visited.add(table);
      ordered.push(table);
    };
    for (const table of tables) visit(table);

    // This guarded local transaction is the only path allowed to disable immutable-history
    // user triggers. Foreign-key triggers remain active and are honored by child-first ordering.
    const deletedByTable: Record<string, number> = {};
    for (const table of ordered) {
      await client.query(`alter table ${quoteIdentifier(table)} disable trigger user`);
      const deleted = await client.query(
        `delete from ${quoteIdentifier(table)} where organization_id=$1`,
        [context.organizationId],
      );
      await client.query(`alter table ${quoteIdentifier(table)} enable trigger user`);
      if ((deleted.rowCount ?? 0) > 0) deletedByTable[table] = deleted.rowCount ?? 0;
    }
    const auditEventId = randomUUID();
    const deletedRows = Object.values(deletedByTable).reduce((sum, count) => sum + count, 0);
    await client.query(
      `insert into resource_audit_events
       (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state)
       values ($1,$2,'organization',$1,1,'local_reset',$3,$4,$5)`,
      [
        context.organizationId,
        auditEventId,
        context.actorId,
        context.correlationId,
        {
          packageId: input.packageId,
          workbookSha256: input.workbookSha256,
          deletedRows,
          deletedByTable,
          preservedTables: [...LOCAL_RESET_PRESERVE].sort(),
        },
      ],
    );
    const response: LocalOrganizationResetResult = {
      organizationId: context.organizationId,
      packageId: input.packageId,
      workbookSha256: input.workbookSha256,
      deletedRows,
      deletedByTable,
      preservedTables: [...LOCAL_RESET_PRESERVE].sort(),
      auditEventId,
      idempotencyReplayed: false,
    };
    await client.query(
      `insert into api_idempotency_records
       (organization_id,idempotency_key,operation,request_hash,response_body)
       values ($1,$2,$3,$4,$5)`,
      [context.organizationId, idempotencyKey, operation, requestHash, response],
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
