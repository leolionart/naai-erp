import { createHash, randomUUID } from "node:crypto";
import type { OutboundStoreContext } from "./outbound-event.store.types.js";
import type {
  ReplayOutboundEventInput,
  UpdateOutboundEndpointInput,
} from "./outbound-event.types.js";
import type { PgOutboundEventStore } from "./pg-outbound-event.store.js";

export async function updateEndpointOperation(
  this: PgOutboundEventStore,
  context: OutboundStoreContext,
  endpointId: string,
  expectedVersion: string,
  input: UpdateOutboundEndpointInput,
  idempotencyKey: string,
) {
  const client = await this.pool.connect();
  const operation = `outbound_endpoint.update:${endpointId}`;
  const requestHash = createHash("sha256")
    .update(JSON.stringify({ expectedVersion, input }))
    .digest("hex");
  try {
    await client.query("begin");
    const prior = await this.idempotent(
      client,
      context.organizationId,
      idempotencyKey,
      operation,
      requestHash,
    );
    if (prior) {
      await client.query("commit");
      return { ...prior, idempotencyReplayed: true };
    }
    const before = await client.query(
      `select * from outbound_webhook_subscriptions
       where organization_id=$1 and id=$2 for update`,
      [context.organizationId, endpointId],
    );
    if (!before.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    if (String(before.rows[0].version) !== expectedVersion) throw new Error("VERSION_CONFLICT");
    const updated = await client.query(
      `update outbound_webhook_subscriptions set name=$3,endpoint_url=$4,event_types=$5,
       secret_ref=$6,status=$7,max_attempts=$8,timeout_seconds=$9,base_delay_seconds=$10,
       max_delay_seconds=$11,updated_by=$12,version=version+1,updated_at=now()
       where organization_id=$1 and id=$2
       returning id,name,endpoint_url,event_types,status,max_attempts,timeout_seconds,
        base_delay_seconds,max_delay_seconds,version::text,created_at,updated_at`,
      [
        context.organizationId,
        endpointId,
        input.name?.trim() ?? before.rows[0].name,
        input.endpointUrl ?? before.rows[0].endpoint_url,
        input.eventTypes
          ? JSON.stringify([...new Set(input.eventTypes)])
          : before.rows[0].event_types,
        input.secretRef?.trim() ?? before.rows[0].secret_ref,
        input.status ?? before.rows[0].status,
        input.maxAttempts ?? before.rows[0].max_attempts,
        input.timeoutSeconds ?? before.rows[0].timeout_seconds,
        input.baseDelaySeconds ?? before.rows[0].base_delay_seconds,
        input.maxDelaySeconds ?? before.rows[0].max_delay_seconds,
        context.actorId,
      ],
    );
    const auditEventId = randomUUID();
    await client.query(
      `insert into resource_audit_events
       (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,
        correlation_id,before_state,after_state)
       values($1,$2,'outbound_endpoint',$3,$4,'updated',$5,$6,$7,$8)`,
      [
        context.organizationId,
        auditEventId,
        endpointId,
        updated.rows[0].version,
        context.actorId,
        context.correlationId,
        this.redactSubscription(before.rows[0]),
        updated.rows[0],
      ],
    );
    const response = {
      ...updated.rows[0],
      auditEventId,
      idempotencyReplayed: false,
      nextActions: ["get", "update"],
    };
    await this.saveIdempotent(
      client,
      context.organizationId,
      idempotencyKey,
      operation,
      requestHash,
      response,
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

export async function replayOperation(
  this: PgOutboundEventStore,
  context: OutboundStoreContext,
  eventId: string,
  input: ReplayOutboundEventInput,
  idempotencyKey: string,
) {
  const client = await this.pool.connect();
  const operation = `outbound_event.replay:${eventId}`;
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${context.organizationId}:${idempotencyKey}`,
    ]);
    const prior = await client.query<{
      operation: string;
      request_hash: string;
      response_body: Record<string, unknown>;
    }>(
      `select operation,request_hash,response_body from api_idempotency_records
       where organization_id=$1 and idempotency_key=$2`,
      [context.organizationId, idempotencyKey],
    );
    if (prior.rows[0]) {
      if (prior.rows[0].operation !== operation || prior.rows[0].request_hash !== requestHash)
        throw new Error("IDEMPOTENCY_CONFLICT");
      await client.query("commit");
      return { ...prior.rows[0].response_body, idempotencyReplayed: true };
    }
    const event = await client.query(
      "select id from outbox_events where organization_id=$1 and id=$2 for update",
      [context.organizationId, eventId],
    );
    if (!event.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    const deliveries = await client.query(
      `update outbound_deliveries set state='pending',next_attempt_at=now(),leased_by=null,
       lease_expires_at=null,dead_lettered_at=null,manual_replay_count=manual_replay_count+1,
       updated_at=now() where organization_id=$1 and outbox_event_id=$2
       and ($3::text is null or subscription_id=$3)
       and state in ('dead_letter','retry_scheduled') returning id,manual_replay_count`,
      [context.organizationId, eventId, input.endpointId ?? null],
    );
    if (!deliveries.rowCount) throw new Error("REPLAY_NOT_ALLOWED");
    const auditEventId = randomUUID();
    const resourceVersion = Math.max(
      ...deliveries.rows.map((row) => Number(row.manual_replay_count)),
    );
    await client.query(
      `insert into resource_audit_events
       (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,
        correlation_id,after_state) values($1,$2,'outbox_event',$3,$4,'manual_replay',$5,$6,$7)`,
      [
        context.organizationId,
        auditEventId,
        eventId,
        resourceVersion,
        context.actorId,
        context.correlationId,
        {
          reason: input.reason,
          endpointId: input.endpointId ?? null,
          deliveries: deliveries.rowCount,
        },
      ],
    );
    const response = {
      outboxEventId: eventId,
      state: "pending",
      replayedDeliveryCount: deliveries.rowCount,
      resourceVersion: String(resourceVersion),
      auditEventId,
      idempotencyReplayed: false,
      nextActions: ["get"],
    };
    await client.query(
      `insert into api_idempotency_records
       (organization_id,idempotency_key,operation,request_hash,response_body) values($1,$2,$3,$4,$5)`,
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
