import { Injectable } from "@nestjs/common";
import pg from "pg";
import { createHash, randomUUID } from "node:crypto";
import { mapWorkbookReviewRow, type ReviewRowRecord } from "./workbook-review-row.mapper.js";
import type { UpdateWorkbookImportReviewRowInput } from "./workbook-import.types.js";
import { REVIEW_ROLES } from "./workbook-import.service.shared.js";
export type { ImportOutcome } from "./workbook-import.service.shared.js";
import { dryRunOperation } from "./workbook-import-service-dry-run.operation.js";
import { commitOperation } from "./workbook-import-service-commit.operation.js";

@Injectable()
export class WorkbookImportService {
  readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  requireReviewRole(roles: readonly string[]) {
    if (!roles.some((role) => REVIEW_ROLES.has(role))) throw new Error("FORBIDDEN");
  }

  reviewRow(row: ReviewRowRecord) {
    return mapWorkbookReviewRow(row);
  }

  async listReviewRows(organizationId: string, roles: readonly string[]) {
    this.requireReviewRole(roles);
    const result = await this.pool.query<ReviewRowRecord>(
      `select * from workbook_import_review_rows
       where organization_id=$1 order by workbook,sheet,source_row,id`,
      [organizationId],
    );
    return result.rows.map((row) => this.reviewRow(row));
  }

  async getReviewRow(organizationId: string, id: string, roles: readonly string[]) {
    this.requireReviewRole(roles);
    const result = await this.pool.query<ReviewRowRecord>(
      `select * from workbook_import_review_rows where organization_id=$1 and id=$2`,
      [organizationId, id],
    );
    if (!result.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    return this.reviewRow(result.rows[0]);
  }

  async updateReviewRow(
    organizationId: string,
    id: string,
    expectedVersion: string,
    input: UpdateWorkbookImportReviewRowInput,
    actorId: string,
    roles: readonly string[],
    correlationId: string,
  ) {
    this.requireReviewRole(roles);
    if (!expectedVersion) throw new Error("VERSION_CONFLICT");
    if (
      input.status !== undefined &&
      !["pending_review", "approved", "ignored", "posted"].includes(input.status)
    )
      throw new Error("VALIDATION_FAILED");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const current = await client.query<ReviewRowRecord>(
        `select * from workbook_import_review_rows
         where organization_id=$1 and id=$2 for update`,
        [organizationId, id],
      );
      const before = current.rows[0];
      if (!before) throw new Error("RESOURCE_NOT_FOUND");
      if (before.version !== expectedVersion) throw new Error("VERSION_CONFLICT");
      const updated = await client.query<ReviewRowRecord>(
        `update workbook_import_review_rows set
           mapped_data=coalesce($3::jsonb,mapped_data),
           resolution=coalesce($4::jsonb,resolution),
           status=coalesce($5::workbook_import_review_status,status),
           notes=case when $6::boolean then $7::text else notes end,
           version=version+1,updated_by=$8,updated_at=now()
         where organization_id=$1 and id=$2 and version=$9::bigint returning *`,
        [
          organizationId,
          id,
          input.mappedData === undefined ? null : JSON.stringify(input.mappedData),
          input.resolution === undefined ? null : JSON.stringify(input.resolution),
          input.status ?? null,
          input.notes !== undefined,
          input.notes ?? null,
          actorId,
          expectedVersion,
        ],
      );
      if (!updated.rows[0]) throw new Error("VERSION_CONFLICT");
      await client.query(
        `insert into resource_audit_events
          (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
         values ($1,$2,'workbook_import_review_row',$3,$4,'update',$5,$6,$7::jsonb,$8::jsonb)`,
        [
          organizationId,
          randomUUID(),
          id,
          updated.rows[0].version,
          actorId,
          correlationId,
          JSON.stringify(this.reviewRow(before)),
          JSON.stringify(this.reviewRow(updated.rows[0])),
        ],
      );
      await client.query("commit");
      return this.reviewRow(updated.rows[0]);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async authenticate(
    rawToken: string,
    organizationId: string,
    _correlationId: string,
  ): Promise<{ actorId: string; roles: readonly string[] }> {
    const result = await this.pool.query<{ actor_id: string; roles: string[] }>(
      `select actor_id, roles from api_credentials
       where organization_id=$1 and token_hash=$2 and status='active'
         and (expires_at is null or expires_at > now())`,
      [organizationId, createHash("sha256").update(rawToken).digest("hex")],
    );
    const row = result.rows[0];
    if (!row) throw new Error("UNAUTHORIZED");
    return { actorId: row.actor_id, roles: row.roles };
  }

  dryRun = dryRunOperation;

  commit = commitOperation;
}
