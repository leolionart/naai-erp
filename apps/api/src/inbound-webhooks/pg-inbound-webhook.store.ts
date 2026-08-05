import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg from "pg";
import type {
  InboundAdminContext,
  IntegrationSource,
  VerifiedInbound,
} from "./inbound-webhook.types.js";

@Injectable()
export class PgInboundWebhookStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  async source(publicId: string) {
    const result = await this.pool.query<{
      organization_id: string;
      id: string;
      public_id: string;
      actor_id: string;
      secret_ref: string;
      status: string;
      allowed_event_types: string[];
      timestamp_tolerance_seconds: number;
      max_attempts: number;
    }>(
      "select organization_id,id,public_id,actor_id,secret_ref,status,allowed_event_types,timestamp_tolerance_seconds,max_attempts from integration_sources where public_id=$1",
      [publicId],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      organizationId: row.organization_id,
      id: row.id,
      publicId: row.public_id,
      actorId: row.actor_id,
      secretRef: row.secret_ref,
      status: row.status,
      allowedEventTypes: row.allowed_event_types,
      timestampToleranceSeconds: row.timestamp_tolerance_seconds,
      maxAttempts: row.max_attempts,
    } satisfies IntegrationSource;
  }
  async sourceById(org: string, id: string) {
    const result = await this.pool.query<{ public_id: string }>(
      "select public_id from integration_sources where organization_id=$1 and id=$2",
      [org, id],
    );
    return result.rows[0] ? this.source(result.rows[0].public_id) : undefined;
  }
  async receive(input: VerifiedInbound) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${input.source.organizationId}:${input.source.id}:${input.idempotencyKey}`,
      ]);
      const prior = await client.query<{
        id: string;
        payload_sha256: string;
        state: string;
        result_body: Record<string, unknown> | null;
      }>(
        "select id,payload_sha256,state,result_body from inbound_messages where organization_id=$1 and source_id=$2 and idempotency_key=$3 for update",
        [input.source.organizationId, input.source.id, input.idempotencyKey],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].payload_sha256 !== input.payloadSha256)
          throw new Error("IDEMPOTENCY_CONFLICT");
        await client.query("commit");
        return {
          messageId: prior.rows[0].id,
          state: prior.rows[0].state,
          result: prior.rows[0].result_body,
          idempotencyReplayed: true,
        };
      }
      const external = await client.query<{
        id: string;
        payload_sha256: string;
        state: string;
        result_body: Record<string, unknown> | null;
      }>(
        "select id,payload_sha256,state,result_body from inbound_messages where organization_id=$1 and source_id=$2 and event_type=$3 and external_id=$4 for update",
        [
          input.source.organizationId,
          input.source.id,
          input.envelope.eventType,
          input.envelope.externalId,
        ],
      );
      if (external.rows[0]) {
        if (external.rows[0].payload_sha256 !== input.payloadSha256)
          throw new Error("WEBHOOK_EXTERNAL_ID_CONFLICT");
        await client.query("commit");
        return {
          messageId: external.rows[0].id,
          state: external.rows[0].state,
          result: external.rows[0].result_body,
          idempotencyReplayed: true,
        };
      }
      const id = randomUUID();
      await client.query(
        `insert into inbound_messages(organization_id,id,source_id,idempotency_key,external_id,event_type,schema_version,raw_payload,payload_sha256,signature_timestamp,state,correlation_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'received',$11)`,
        [
          input.source.organizationId,
          id,
          input.source.id,
          input.idempotencyKey,
          input.envelope.externalId,
          input.envelope.eventType,
          input.envelope.schemaVersion,
          input.rawPayload,
          input.payloadSha256,
          input.timestamp,
          input.correlationId,
        ],
      );
      await client.query("commit");
      return { messageId: id, state: "received", idempotencyReplayed: false };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  async finish(
    org: string,
    id: string,
    actorId: string,
    correlationId: string,
    outcome: "processed" | "quarantined" | "retryable_failure",
    result?: Record<string, unknown>,
    error?: { code: string; summary: string },
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const message = await client.query<{ attempt_count: number }>(
        "select attempt_count from inbound_messages where organization_id=$1 and id=$2 for update",
        [org, id],
      );
      if (!message.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      const attempt = message.rows[0].attempt_count + 1;
      const state =
        outcome === "processed"
          ? "processed"
          : outcome === "quarantined"
            ? "quarantined"
            : "retry_scheduled";
      await client.query(
        `update inbound_messages set state=$3,attempt_count=$4,result_body=$5,last_error_code=$6,last_error_summary=$7,completed_at=case when $3 in ('processed','quarantined') then now() else null end,updated_at=now() where organization_id=$1 and id=$2`,
        [org, id, state, attempt, result ?? null, error?.code ?? null, error?.summary ?? null],
      );
      await client.query(
        `insert into inbound_message_attempts(organization_id,id,message_id,attempt_number,outcome,actor_id,reason,error_code,error_summary,correlation_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          org,
          randomUUID(),
          id,
          attempt,
          outcome,
          actorId,
          outcome,
          error?.code ?? null,
          error?.summary ?? null,
          correlationId,
        ],
      );
      await client.query(
        `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state) values($1,$2,'inbound_message',$3,$4,$5,$6,$7,$8)`,
        [
          org,
          randomUUID(),
          id,
          attempt,
          state,
          actorId,
          correlationId,
          { state, result: result ?? null, errorCode: error?.code ?? null },
        ],
      );
      await client.query("commit");
      return {
        messageId: id,
        state,
        attemptCount: attempt,
        result: result ?? null,
        error: error ?? null,
      };
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }
  async list(org: string, state?: string) {
    const result = await this.pool.query(
      "select id,source_id,external_id,event_type,schema_version,payload_sha256,state,attempt_count,last_error_code,correlation_id,received_at,completed_at from inbound_messages where organization_id=$1 and ($2::text is null or state::text=$2) order by received_at desc",
      [org, state ?? null],
    );
    return result.rows;
  }
  async get(org: string, id: string) {
    const message = await this.pool.query(
      "select * from inbound_messages where organization_id=$1 and id=$2",
      [org, id],
    );
    if (!message.rows[0]) return undefined;
    const attempts = await this.pool.query(
      "select attempt_number,outcome,actor_id,reason,error_code,error_summary,correlation_id,started_at,completed_at from inbound_message_attempts where organization_id=$1 and message_id=$2 order by attempt_number",
      [org, id],
    );
    return { ...message.rows[0], attempts: attempts.rows };
  }
  async replayPayload(
    context: InboundAdminContext,
    id: string,
    reason: string,
    corrected?: Record<string, unknown>,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const row = await client.query<{
        source_id: string;
        raw_payload: Record<string, unknown>;
        state: string;
      }>(
        "select source_id,raw_payload,state from inbound_messages where organization_id=$1 and id=$2 for update",
        [context.organizationId, id],
      );
      if (!row.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      if (!["quarantined", "retry_scheduled", "dead_letter"].includes(row.rows[0].state))
        throw new Error("WEBHOOK_REPLAY_NOT_ALLOWED");
      if (corrected)
        await client.query(
          "update inbound_messages set corrected_payload=$3,updated_at=now() where organization_id=$1 and id=$2",
          [context.organizationId, id, corrected],
        );
      await client.query(
        `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state) values($1,$2,'inbound_message',$3,1,'replay_requested',$4,$5,$6)`,
        [
          context.organizationId,
          randomUUID(),
          id,
          context.actorId,
          context.correlationId,
          { reason, corrected: Boolean(corrected) },
        ],
      );
      await client.query("commit");
      return { sourceId: row.rows[0].source_id, payload: corrected ?? row.rows[0].raw_payload };
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }
}
