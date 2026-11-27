import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { PORTABLE_DATA_PACKAGE_SCHEMA_VERSION } from "@naai-erp/contracts";
import pg from "pg";
import { pruneGeneratedExportContent } from "../report-exports/export-retention.js";
import type {
  PortableDataPackageContext,
  PortableDataPackageStore,
  PortablePackageRecord,
  SavePortablePackageInput,
} from "./portable-data-package.types.js";
import { type ColumnRow, sha } from "./pg-portable-data-package.store.shared.js";
import {
  collectOrganizationResourcesOperation,
  resetLocalOrganizationOperation,
} from "./portable-data-package-collect-organization-resources.operation.js";

@Injectable()
export class PgPortableDataPackageStore implements PortableDataPackageStore {
  readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  async columnInventory() {
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

  async portableLines(tableName: string, organizationId: string, id: string) {
    if (tableName === "commercial_documents") {
      const result = await this.pool.query(
        `select coalesce(jsonb_agg(jsonb_build_object(
          'description',l.description,'quantity',l.quantity,'unitPriceMinor',l.unit_price_minor::text,
          'netMinor',l.net_minor::text,'taxMinor',l.tax_minor::text,'grossMinor',l.gross_minor::text,
          'primaryAccountCode',l.primary_account_code,'categoryCode',l.category_code,
          'taxAccountCode',l.tax_account_code,'taxCode',l.tax_code,'dimensions',l.dimensions,
          'managementState',l.management_state,'citState',l.cit_state,'vatState',l.vat_state,
          'citEligibleMinor',l.cit_eligible_minor::text,'vatEligibleMinor',l.vat_eligible_minor::text,
          'reviewedBy',l.reviewed_by,'reviewedAt',l.reviewed_at,
          'reviewReason',l.review_reason,'reviewReference',l.review_reference,
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
          'expenseCategoryCode',l.expense_category_code,'fundingTreatment',l.funding_treatment,
          'vatAccountCode',l.vat_account_code,'dimensions',l.dimensions,
          'managementState',l.management_state,'citState',l.cit_state,'vatState',l.vat_state,
          'citEligibleMinor',l.cit_eligible_minor::text,'vatEligibleMinor',l.vat_eligible_minor::text,
          'reviewedBy',l.reviewed_by,'reviewedAt',l.reviewed_at,
          'reviewReason',l.review_reason,'reviewReference',l.review_reference,
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
  async portableExternalReferences(tableName: string, organizationId: string, id: string) {
    if (!["commercial_documents", "expenses"].includes(tableName)) return [];
    const target = tableName === "commercial_documents" ? "document_id" : "expense_id";
    const result = await this.pool.query<{ system: string; external_id: string }>(
      `select system,external_id from external_references where organization_id=$1 and ${target}=$2 order by system,external_id`,
      [organizationId, id],
    );
    return result.rows.map((row) => ({ system: row.system, externalId: row.external_id }));
  }

  collectOrganizationResources = collectOrganizationResourcesOperation;

  contract(row: Record<string, unknown>): PortablePackageRecord {
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
      contentPrunedAt: row.content_pruned_at
        ? new Date(row.content_pruned_at as string | Date).toISOString()
        : null,
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
          JSON.stringify(input.manifest),
          JSON.stringify(input.schemas),
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
      void pruneGeneratedExportContent(this.pool, context.organizationId).catch(() => undefined);
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
      `select organization_id,id,as_of,filename,media_type,size_bytes,content_hash,manifest,generated_at,generated_by,correlation_id,content_pruned_at
       from portable_data_packages where organization_id=$1 and id=$2`,
      [context.organizationId, packageId],
    );
    return result.rows[0] ? this.contract(result.rows[0]) : undefined;
  }

  async listExports(context: PortableDataPackageContext, limit = 50) {
    const bounded = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 50;
    const result = await this.pool.query(
      `select organization_id,id,as_of,filename,media_type,size_bytes,content_hash,manifest,generated_at,generated_by,correlation_id,content_pruned_at
         from portable_data_packages
        where organization_id=$1
        order by generated_at desc, id desc
        limit $2`,
      [context.organizationId, bounded],
    );
    return result.rows.map((row) => this.contract(row));
  }

  async downloadExport(context: PortableDataPackageContext, packageId: string) {
    const result = await this.pool.query(
      `select content,filename,media_type,content_hash from portable_data_packages where organization_id=$1 and id=$2`,
      [context.organizationId, packageId],
    );
    const row = result.rows[0];
    if (row && row.content == null) throw new Error("EXPORT_CONTENT_PRUNED");
    return row
      ? {
          content: row.content as Buffer,
          filename: String(row.filename),
          mediaType: String(row.media_type),
          contentHash: String(row.content_hash),
        }
      : undefined;
  }

  async deleteExport(
    context: PortableDataPackageContext,
    packageId: string,
    _idempotencyKey: string,
  ) {
    const result = await this.pool.query(
      `delete from portable_data_packages where organization_id=$1 and id=$2 returning id`,
      [context.organizationId, packageId],
    );
    return { packageId, deleted: result.rowCount === 1 };
  }

  resetLocalOrganization = resetLocalOrganizationOperation;
}
