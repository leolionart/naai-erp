import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg, { type PoolClient } from "pg";
import { nextEvidenceVersion } from "@naai-erp/domain";
import type {
  EvidenceContext,
  ReviewEvidenceInput,
  UploadEvidenceInput,
} from "./evidence.types.js";

type PreparedUpload = {
  evidenceId: string;
  versionNumber: number;
  supersedesVersion?: number;
  objectKey: string;
  requestHash: string;
  input: UploadEvidenceInput;
  validation: { detectedMediaType: string; byteSize: number; sha256: string };
  idempotencyReplayed: boolean;
  replay?: Record<string, unknown>;
};

@Injectable()
export class PgEvidenceStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  async list(org: string, subjectType?: string, subjectId?: string) {
    const result = await this.pool.query(
      `select r.*,v.status,v.review_state,v.original_filename,v.detected_media_type,v.byte_size::text,v.sha256,v.uploaded_at
       from evidence_records r join evidence_versions v on v.organization_id=r.organization_id and v.evidence_id=r.id and v.version_number=r.current_version
       where r.organization_id=$1 and ($2::text is null or r.subject_type=$2) and ($3::text is null or r.subject_id=$3)
       order by r.updated_at desc,r.id`,
      [org, subjectType ?? null, subjectId ?? null],
    );
    return result.rows;
  }

  async get(org: string, id: string) {
    const record = await this.pool.query(
      "select * from evidence_records where organization_id=$1 and id=$2",
      [org, id],
    );
    if (!record.rows[0]) return undefined;
    const versions = await this.pool.query(
      `select version_number,status,review_state,original_filename,declared_media_type,detected_media_type,byte_size::text,sha256,source,supersedes_version,uploaded_by,uploaded_at,reviewed_by,reviewed_at,review_reason,review_reference
       from evidence_versions where organization_id=$1 and evidence_id=$2 order by version_number desc`,
      [org, id],
    );
    return { ...record.rows[0], versions: versions.rows };
  }

  async prepareUpload(
    context: EvidenceContext,
    input: UploadEvidenceInput,
    validation: { detectedMediaType: string; byteSize: number; sha256: string },
    key: string,
  ): Promise<PreparedUpload> {
    const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const replay = await this.pool.query<{
      request_hash: string;
      operation: string;
      response_body: Record<string, unknown>;
    }>(
      "select request_hash,operation,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2",
      [context.organizationId, key],
    );
    if (replay.rows[0]) {
      if (
        replay.rows[0].request_hash !== requestHash ||
        replay.rows[0].operation !== "evidence:upload"
      )
        throw new Error("IDEMPOTENCY_CONFLICT");
      return {
        evidenceId: String(replay.rows[0].response_body.evidenceId),
        versionNumber: Number(replay.rows[0].response_body.versionNumber),
        objectKey: "",
        requestHash,
        input,
        validation,
        idempotencyReplayed: true,
        replay: replay.rows[0].response_body,
      };
    }
    await this.assertSubject(context.organizationId, input.subjectType, input.subjectId);
    const evidenceId = input.evidenceId ?? randomUUID();
    const current = input.evidenceId
      ? await this.pool.query<{
          version_number: number;
          status: "active" | "superseded" | "quarantined";
        }>(
          "select version_number,status from evidence_versions where organization_id=$1 and evidence_id=$2 order by version_number",
          [context.organizationId, evidenceId],
        )
      : { rows: [] };
    const version = nextEvidenceVersion({
      organizationId: createHash("sha256")
        .update(context.organizationId)
        .digest("hex")
        .slice(0, 16),
      evidenceId,
      current: current.rows.map((row) => ({ version: row.version_number, status: row.status })),
      generatedKeySuffix: randomUUID(),
    });
    return {
      evidenceId,
      versionNumber: version.version,
      ...(version.supersedesVersion ? { supersedesVersion: version.supersedesVersion } : {}),
      objectKey: version.objectKey,
      requestHash,
      input,
      validation,
      idempotencyReplayed: false,
    };
  }

  async completeUpload(
    context: EvidenceContext,
    prepared: PreparedUpload,
    bucket: string,
    key: string,
  ) {
    if (prepared.idempotencyReplayed) return { ...prepared.replay, idempotencyReplayed: true };
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${context.organizationId}:${prepared.evidenceId}`,
      ]);
      const existing = await client.query<{ current_version: number }>(
        "select current_version from evidence_records where organization_id=$1 and id=$2 for update",
        [context.organizationId, prepared.evidenceId],
      );
      const versionNumber = existing.rows[0] ? existing.rows[0].current_version + 1 : 1;
      if (existing.rows[0]) {
        await client.query(
          "update evidence_versions set status='superseded' where organization_id=$1 and evidence_id=$2 and version_number=$3 and status='active'",
          [context.organizationId, prepared.evidenceId, existing.rows[0].current_version],
        );
        await client.query(
          "update evidence_records set current_version=$3,version=version+1,updated_at=now() where organization_id=$1 and id=$2",
          [context.organizationId, prepared.evidenceId, versionNumber],
        );
      } else {
        await client.query(
          `insert into evidence_records(organization_id,id,subject_type,subject_id,evidence_type,current_version,created_by)
           values($1,$2,$3,$4,$5,1,$6)`,
          [
            context.organizationId,
            prepared.evidenceId,
            prepared.input.subjectType,
            prepared.input.subjectId,
            prepared.input.evidenceType,
            context.actorId,
          ],
        );
      }
      const objectKey =
        versionNumber === prepared.versionNumber
          ? prepared.objectKey
          : `${createHash("sha256").update(context.organizationId).digest("hex").slice(0, 16)}/${prepared.evidenceId}/${versionNumber}/${randomUUID()}`;
      if (objectKey !== prepared.objectKey) throw new Error("EVIDENCE_CONCURRENT_REPLACEMENT");
      await client.query(
        `insert into evidence_versions(organization_id,evidence_id,version_number,status,review_state,object_bucket,object_key,original_filename,declared_media_type,detected_media_type,byte_size,sha256,source,supersedes_version,uploaded_by)
         values($1,$2,$3,'active','pending',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          context.organizationId,
          prepared.evidenceId,
          versionNumber,
          bucket,
          objectKey,
          this.safeFilename(prepared.input.originalFilename),
          prepared.input.declaredMediaType,
          prepared.validation.detectedMediaType,
          prepared.validation.byteSize,
          prepared.validation.sha256,
          prepared.input.source,
          existing.rows[0]?.current_version ?? null,
          context.actorId,
        ],
      );
      const duplicate = await client.query<{ evidence_id: string; version_number: number }>(
        `select evidence_id,version_number from evidence_versions where organization_id=$1 and sha256=$2 and not (evidence_id=$3 and version_number=$4) order by uploaded_at limit 20`,
        [context.organizationId, prepared.validation.sha256, prepared.evidenceId, versionNumber],
      );
      const auditEventId = randomUUID(),
        outboxEventId = randomUUID(),
        accessEventId = randomUUID();
      await client.query(
        `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state)
         values($1,$2,'evidence',$3,$4,'upload',$5,$6,$7)`,
        [
          context.organizationId,
          auditEventId,
          prepared.evidenceId,
          versionNumber,
          context.actorId,
          context.correlationId,
          { versionNumber, sha256: prepared.validation.sha256 },
        ],
      );
      await client.query(
        `insert into evidence_access_events(organization_id,id,evidence_id,version_number,action,actor_id,correlation_id,details)
         values($1,$2,$3,$4,'upload',$5,$6,$7)`,
        [
          context.organizationId,
          accessEventId,
          prepared.evidenceId,
          versionNumber,
          context.actorId,
          context.correlationId,
          { source: prepared.input.source },
        ],
      );
      await client.query(
        `insert into outbox_events(organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)
         values($1,$2,'evidence',$3,'evidence.version_uploaded',1,$4,$5)`,
        [
          context.organizationId,
          outboxEventId,
          prepared.evidenceId,
          { evidenceId: prepared.evidenceId, versionNumber },
          context.correlationId,
        ],
      );
      const response = {
        evidenceId: prepared.evidenceId,
        versionNumber,
        status: "active",
        reviewState: "pending",
        sha256: prepared.validation.sha256,
        byteSize: String(prepared.validation.byteSize),
        detectedMediaType: prepared.validation.detectedMediaType,
        duplicates: duplicate.rows.map((row) => ({
          evidenceId: row.evidence_id,
          versionNumber: row.version_number,
        })),
        auditEventId,
        outboxEventId,
        accessEventId,
        resourceVersion: String(versionNumber),
        nextActions: ["review", "download-url", "replace"],
      };
      await this.save(
        client,
        context.organizationId,
        key,
        "evidence:upload",
        prepared.requestHash,
        response,
      );
      await client.query("commit");
      return { ...response, idempotencyReplayed: false };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async review(context: EvidenceContext, id: string, input: ReviewEvidenceInput, key: string) {
    const hash = createHash("sha256").update(JSON.stringify({ id, input })).digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replay = await this.replay(
        client,
        context.organizationId,
        key,
        "evidence:review",
        hash,
      );
      if (replay) {
        await client.query("rollback");
        return { ...replay, idempotencyReplayed: true };
      }
      const row = await client.query<{ version_number: number; status: string }>(
        `select v.version_number,v.status from evidence_records r join evidence_versions v on v.organization_id=r.organization_id and v.evidence_id=r.id and v.version_number=coalesce($3,r.current_version)
         where r.organization_id=$1 and r.id=$2 for update of v`,
        [context.organizationId, id, input.version ?? null],
      );
      if (!row.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      if (row.rows[0].status !== "active") throw new Error("EVIDENCE_VERSION_NOT_ACTIVE");
      await client.query(
        `update evidence_versions set review_state=$4,reviewed_by=$5,reviewed_at=now(),review_reason=$6,review_reference=$7
         where organization_id=$1 and evidence_id=$2 and version_number=$3`,
        [
          context.organizationId,
          id,
          row.rows[0].version_number,
          input.state,
          context.actorId,
          input.reason,
          input.reference ?? null,
        ],
      );
      const auditEventId = randomUUID(),
        outboxEventId = randomUUID();
      await client.query(
        `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state) values($1,$2,'evidence',$3,$4,'review',$5,$6,$7)`,
        [
          context.organizationId,
          auditEventId,
          id,
          row.rows[0].version_number,
          context.actorId,
          context.correlationId,
          { state: input.state },
        ],
      );
      await client.query(
        `insert into outbox_events(organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id) values($1,$2,'evidence',$3,'evidence.reviewed',1,$4,$5)`,
        [
          context.organizationId,
          outboxEventId,
          id,
          { evidenceId: id, versionNumber: row.rows[0].version_number, state: input.state },
          context.correlationId,
        ],
      );
      const response = {
        evidenceId: id,
        versionNumber: row.rows[0].version_number,
        reviewState: input.state,
        auditEventId,
        outboxEventId,
        nextActions: ["download-url", "replace"],
      };
      await this.save(client, context.organizationId, key, "evidence:review", hash, response);
      await client.query("commit");
      return { ...response, idempotencyReplayed: false };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async authorizeDownload(
    context: EvidenceContext,
    id: string,
    version: number | undefined,
    reason: string,
    seconds: number,
    key: string,
  ) {
    const hash = createHash("sha256")
      .update(JSON.stringify({ id, version, reason, seconds }))
      .digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replay = await this.replay(
        client,
        context.organizationId,
        key,
        "evidence:download",
        hash,
      );
      if (replay) {
        await client.query("rollback");
        return replay as { objectKey: string; originalFilename: string };
      }
      const row = await client.query<{
        version_number: number;
        status: string;
        object_key: string;
        original_filename: string;
      }>(
        `select v.version_number,v.status,v.object_key,v.original_filename from evidence_records r join evidence_versions v on v.organization_id=r.organization_id and v.evidence_id=r.id and v.version_number=coalesce($3,r.current_version) where r.organization_id=$1 and r.id=$2`,
        [context.organizationId, id, version ?? null],
      );
      if (!row.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      if (row.rows[0].status !== "active") throw new Error("EVIDENCE_DOWNLOAD_NOT_ALLOWED");
      const accessEventId = randomUUID(),
        auditEventId = randomUUID(),
        expiresAt = new Date(Date.now() + seconds * 1000).toISOString();
      await client.query(
        `insert into evidence_access_events(organization_id,id,evidence_id,version_number,action,actor_id,reason,correlation_id,expires_at) values($1,$2,$3,$4,'download_url_issued',$5,$6,$7,$8)`,
        [
          context.organizationId,
          accessEventId,
          id,
          row.rows[0].version_number,
          context.actorId,
          reason,
          context.correlationId,
          expiresAt,
        ],
      );
      await client.query(
        `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state) values($1,$2,'evidence',$3,$4,'download_url_issued',$5,$6,$7)`,
        [
          context.organizationId,
          auditEventId,
          id,
          row.rows[0].version_number,
          context.actorId,
          context.correlationId,
          { expiresAt },
        ],
      );
      const response = {
        evidenceId: id,
        versionNumber: row.rows[0].version_number,
        objectKey: row.rows[0].object_key,
        originalFilename: row.rows[0].original_filename,
        accessEventId,
        auditEventId,
        expiresAt,
      };
      await this.save(client, context.organizationId, key, "evidence:download", hash, response);
      await client.query("commit");
      return response;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async assertSubject(org: string, type: string, id: string) {
    const tables: Record<string, string> = {
      commercial_document: "commercial_documents",
      expense: "expenses",
      contract: "contracts",
      project: "projects",
      milestone: "milestones",
    };
    const table = tables[type];
    if (!table) throw new Error("VALIDATION_FAILED");
    const result = await this.pool.query(
      `select 1 from ${table} where organization_id=$1 and id=$2`,
      [org, id],
    );
    if (!result.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
  }
  private safeFilename(value: string) {
    return (
      value
        .replace(/[\\/\0\r\n]/g, "_")
        .slice(0, 255)
        .trim() || "evidence"
    );
  }
  private async replay(c: PoolClient, org: string, key: string, operation: string, hash: string) {
    await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`${org}:${key}`]);
    const result = await c.query<{
      request_hash: string;
      operation: string;
      response_body: Record<string, unknown>;
    }>(
      "select request_hash,operation,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2 for update",
      [org, key],
    );
    if (!result.rows[0]) return undefined;
    if (result.rows[0].request_hash !== hash || result.rows[0].operation !== operation)
      throw new Error("IDEMPOTENCY_CONFLICT");
    return result.rows[0].response_body;
  }
  private save(
    c: PoolClient,
    org: string,
    key: string,
    operation: string,
    hash: string,
    response: unknown,
  ) {
    return c.query(
      "insert into api_idempotency_records(organization_id,idempotency_key,operation,request_hash,response_body) values($1,$2,$3,$4,$5)",
      [org, key, operation, hash, response],
    );
  }
}
