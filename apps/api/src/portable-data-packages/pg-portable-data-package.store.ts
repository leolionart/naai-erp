import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import {
  PORTABLE_DATA_PACKAGE_SCHEMA_VERSION,
  type PortableCellTypeContract,
  type PortableRowEnvelopeContract,
  type PortableSheetColumnContract,
} from "@naai-erp/contracts";
import pg from "pg";
import { MASTER_DATA_RESOURCES } from "../master-data/resource-registry.js";
import type {
  PortableDataPackageContext,
  PortableDataPackageStore,
  PortablePackageRecord,
  PortableResourceExport,
  SavePortablePackageInput,
} from "./portable-data-package.types.js";
import { portableMutationEntry } from "./portable-resource-mutation-matrix.js";

type ColumnRow = Readonly<{
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: "YES" | "NO";
  ordinal_position: number;
}>;

const EXCLUDED_RESOURCES: Readonly<Record<string, string>> = {
  api_credentials: "Authentication credentials and token hashes are never portable business data",
  api_idempotency_records: "Internal request replay controls are environment-local",
  portable_data_packages: "Generated package bytes cannot recursively contain data packages",
  portable_data_imports: "Import staging and replay controls are environment-local",
};
const SECRET_COLUMN =
  /(^|_)(secret|password|token_hash|access_token|refresh_token|private_key|signed_url)($|_)/i;
const BINARY_TYPES = new Set(["bytea"]);
const DATE_COLUMNS = ["created_at", "occurred_at", "generated_at", "captured_at", "received_at"];
const MASTER_RESOURCE_BY_TABLE = new Map<string, string>(
  Object.entries(MASTER_DATA_RESOURCES).map(([resource, definition]) => [
    definition.table,
    resource,
  ]),
);
const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const canonical = (value: unknown) =>
  JSON.stringify(
    value,
    Object.keys((value && typeof value === "object" ? value : {}) as object).sort(),
  );
const scalar = (value: unknown): string | boolean | null => {
  if (value == null) return null;
  if (typeof value === "boolean" || typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint" || typeof value === "number") return String(value);
  return JSON.stringify(value);
};
const cellType = (column: ColumnRow): PortableCellTypeContract => {
  if (column.data_type === "boolean") return "boolean";
  if (["smallint", "integer", "bigint", "numeric", "decimal"].includes(column.data_type))
    return "integer";
  if (column.data_type === "date") return "date";
  if (column.data_type.includes("timestamp")) return "timestamp";
  if (["json", "jsonb", "ARRAY"].includes(column.data_type)) return "json";
  return "string";
};

@Injectable()
export class PgPortableDataPackageStore implements PortableDataPackageStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  private async columnInventory() {
    const result = await this.pool.query<ColumnRow>(
      `select c.table_name,c.column_name,c.data_type,c.udt_name,c.is_nullable,c.ordinal_position
       from information_schema.columns c
       join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name
       where c.table_schema='public' and t.table_type='BASE TABLE'
         and (c.table_name='organizations' or exists (
           select 1 from information_schema.columns o
           where o.table_schema='public' and o.table_name=c.table_name and o.column_name='organization_id'
         ))
       order by c.table_name,c.ordinal_position`,
    );
    const grouped = new Map<string, ColumnRow[]>();
    for (const column of result.rows) {
      const columns = grouped.get(column.table_name) ?? [];
      columns.push(column);
      grouped.set(column.table_name, columns);
    }
    return grouped;
  }

  private async portableLines(tableName: string, organizationId: string, id: string) {
    if (tableName === "commercial_documents") {
      const result = await this.pool.query(
        `select coalesce(jsonb_agg(jsonb_build_object(
          'description',l.description,'quantity',l.quantity,'unitPriceMinor',l.unit_price_minor::text,
          'netMinor',l.net_minor::text,'taxMinor',l.tax_minor::text,'grossMinor',l.gross_minor::text,
          'primaryAccountCode',l.primary_account_code,'taxAccountCode',l.tax_account_code,
          'taxCode',l.tax_code,'dimensions',l.dimensions,
          'allocations',(select coalesce(jsonb_agg(jsonb_build_object(
            'id',coalesce(a.dimensions->>'allocationId',a.allocation_number::text),
            'amountMinor',a.amount_minor::text,'dimensions',a.dimensions-'allocationId') order by a.allocation_number),'[]'::jsonb)
            from commercial_document_allocations a where a.organization_id=l.organization_id
              and a.document_id=l.document_id and a.line_number=l.line_number)
        ) order by l.line_number),'[]'::jsonb) lines
        from commercial_document_lines l where l.organization_id=$1 and l.document_id=$2`,
        [organizationId, id],
      );
      return result.rows[0]?.lines ?? [];
    }
    if (tableName === "expenses") {
      const result = await this.pool.query(
        `select coalesce(jsonb_agg(jsonb_build_object(
          'description',l.description,'netMinor',l.net_minor::text,'vatMinor',l.vat_minor::text,
          'grossMinor',l.gross_minor::text,'postingAccountCode',l.posting_account_code,
          'vatAccountCode',l.vat_account_code,'dimensions',l.dimensions,
          'managementState',l.management_state,'citState',l.cit_state,'vatState',l.vat_state,
          'citEligibleMinor',l.cit_eligible_minor::text,'vatEligibleMinor',l.vat_eligible_minor::text,
          'allocations',(select coalesce(jsonb_agg(jsonb_build_object(
            'id',coalesce(a.dimensions->>'allocationId',a.allocation_number::text),
            'amountMinor',a.amount_minor::text,'dimensions',a.dimensions-'allocationId') order by a.allocation_number),'[]'::jsonb)
            from expense_allocations a where a.organization_id=l.organization_id
              and a.expense_id=l.expense_id and a.line_number=l.line_number)
        ) order by l.line_number),'[]'::jsonb) lines
        from expense_lines l where l.organization_id=$1 and l.expense_id=$2`,
        [organizationId, id],
      );
      return result.rows[0]?.lines ?? [];
    }
    return undefined;
  }

  async collectOrganizationResources(
    context: PortableDataPackageContext,
    asOf: string,
  ): Promise<readonly PortableResourceExport[]> {
    const resources: PortableResourceExport[] = [];
    for (const [tableName, sourceColumns] of await this.columnInventory()) {
      const resourceType = MASTER_RESOURCE_BY_TABLE.get(tableName) ?? tableName;
      const excludedReason = EXCLUDED_RESOURCES[tableName];
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
            ? { lines: await this.portableLines(tableName, context.organizationId, String(row.id)) }
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
          externalReferences: [],
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
          dependencyOrder: tableName === "organizations" ? 0 : 100,
          mutability,
        },
        schema: {
          resourceType,
          sheetName: tableName,
          schemaVersion: PORTABLE_DATA_PACKAGE_SCHEMA_VERSION,
          stableIdColumn: "stableId",
          ...(names.includes("version")
            ? { resourceVersionColumn: "expectedResourceVersion" }
            : {}),
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

  private contract(row: Record<string, unknown>): PortablePackageRecord {
    return {
      packageId: String(row.id),
      organizationId: String(row.organization_id),
      asOf:
        row.as_of instanceof Date
          ? row.as_of.toISOString().slice(0, 10)
          : String(row.as_of).slice(0, 10),
      format: "xlsx",
      filename: String(row.filename),
      mediaType: String(row.media_type),
      sizeBytes: Number(row.size_bytes),
      contentHash: String(row.content_hash),
      manifest: row.manifest as PortablePackageRecord["manifest"],
      generatedAt: new Date(row.generated_at as string | Date).toISOString(),
      generatedBy: String(row.generated_by),
      correlationId: String(row.correlation_id),
    };
  }

  async saveExport(
    context: PortableDataPackageContext,
    input: SavePortablePackageInput,
    idempotencyKey: string,
  ) {
    const requestHash = sha(JSON.stringify(input.input));
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const existing = await client.query(
        `select * from portable_data_packages where organization_id=$1 and idempotency_key=$2 for update`,
        [context.organizationId, idempotencyKey],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
        await client.query("commit");
        return this.contract(existing.rows[0]);
      }
      const inserted = await client.query(
        `insert into portable_data_packages
         (organization_id,id,schema_version,as_of,format,manifest,schemas,content,content_hash,package_hash,size_bytes,media_type,filename,idempotency_key,request_hash,generated_by,correlation_id,generated_at)
         values ($1,$2,$3,$4,'xlsx',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning *`,
        [
          context.organizationId,
          input.packageId,
          PORTABLE_DATA_PACKAGE_SCHEMA_VERSION,
          input.input.asOf,
          input.manifest,
          input.schemas,
          input.content,
          input.contentHash,
          input.manifest.packageHash,
          input.content.length,
          input.mediaType,
          input.filename,
          idempotencyKey,
          requestHash,
          context.actorId,
          context.correlationId,
          input.manifest.exportedAt,
        ],
      );
      await client.query(
        `insert into resource_audit_events
         (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state)
         values ($1,$2,'portable_data_package',$3,1,'export_created',$4,$5,$6)`,
        [
          context.organizationId,
          randomUUID(),
          input.packageId,
          context.actorId,
          context.correlationId,
          {
            asOf: input.input.asOf,
            contentHash: input.contentHash,
            packageHash: input.manifest.packageHash,
            sizeBytes: input.content.length,
          },
        ],
      );
      await client.query("commit");
      return this.contract(inserted.rows[0]);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async getExport(context: PortableDataPackageContext, packageId: string) {
    const result = await this.pool.query(
      `select organization_id,id,as_of,filename,media_type,size_bytes,content_hash,manifest,generated_at,generated_by,correlation_id
       from portable_data_packages where organization_id=$1 and id=$2`,
      [context.organizationId, packageId],
    );
    return result.rows[0] ? this.contract(result.rows[0]) : undefined;
  }

  async downloadExport(context: PortableDataPackageContext, packageId: string) {
    const result = await this.pool.query(
      `select content,filename,media_type,content_hash from portable_data_packages where organization_id=$1 and id=$2`,
      [context.organizationId, packageId],
    );
    const row = result.rows[0];
    return row
      ? {
          content: row.content as Buffer,
          filename: String(row.filename),
          mediaType: String(row.media_type),
          contentHash: String(row.content_hash),
        }
      : undefined;
  }
}
