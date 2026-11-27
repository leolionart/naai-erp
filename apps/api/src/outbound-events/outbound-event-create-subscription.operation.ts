import { createHash, randomUUID } from "node:crypto";
import type {
  LeasedOutboundDelivery,
  OutboundAttemptResult,
  OutboundStoreContext,
  OutboundSubscriptionInput,
} from "./outbound-event.store.types.js";
import type { CreateOutboundEndpointInput } from "./outbound-event.types.js";
import type { PgOutboundEventStore } from "./pg-outbound-event.store.js";

export async function createSubscriptionOperation(
  this: PgOutboundEventStore,
  context: OutboundStoreContext,
  input: OutboundSubscriptionInput,
) {
  const id = input.id ?? randomUUID();
  const client = await this.pool.connect();
  try {
    await client.query("begin");
    const result = await client.query(
      `insert into outbound_webhook_subscriptions
       (organization_id,id,name,endpoint_url,event_types,secret_ref,max_attempts,timeout_seconds,
        base_delay_seconds,max_delay_seconds,created_by,updated_by)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
       returning id,name,endpoint_url,event_types,status,max_attempts,timeout_seconds,
        base_delay_seconds,max_delay_seconds,version::text`,
      [
        context.organizationId,
        id,
        input.name.trim(),
        input.endpointUrl,
        JSON.stringify([...new Set(input.eventTypes)]),
        input.secretRef,
        input.maxAttempts ?? 8,
        input.timeoutSeconds ?? 15,
        input.baseDelaySeconds ?? 30,
        input.maxDelaySeconds ?? 3600,
        context.actorId,
      ],
    );
    await this.audit(
      context,
      "outbound_subscription",
      id,
      1n,
      "created",
      result.rows[0],
      undefined,
      client,
    );
    await client.query("commit");
    return result.rows[0];
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateSubscriptionOperation(
  this: PgOutboundEventStore,
  context: OutboundStoreContext,
  id: string,
  expectedVersion: bigint,
  input: Partial<
    Pick<
      OutboundSubscriptionInput,
      | "name"
      | "endpointUrl"
      | "eventTypes"
      | "secretRef"
      | "maxAttempts"
      | "timeoutSeconds"
      | "baseDelaySeconds"
      | "maxDelaySeconds"
    >
  > & { status?: "active" | "paused" | "disabled" },
) {
  const client = await this.pool.connect();
  try {
    await client.query("begin");
    const before = await client.query(
      "select * from outbound_webhook_subscriptions where organization_id=$1 and id=$2 for update",
      [context.organizationId, id],
    );
    if (!before.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    if (BigInt(before.rows[0].version) !== expectedVersion) throw new Error("VERSION_CONFLICT");
    const next = {
      name: input.name?.trim() ?? before.rows[0].name,
      endpointUrl: input.endpointUrl ?? before.rows[0].endpoint_url,
      eventTypes: input.eventTypes
        ? JSON.stringify([...new Set(input.eventTypes)])
        : before.rows[0].event_types,
      secretRef: input.secretRef ?? before.rows[0].secret_ref,
      status: input.status ?? before.rows[0].status,
      maxAttempts: input.maxAttempts ?? before.rows[0].max_attempts,
      timeoutSeconds: input.timeoutSeconds ?? before.rows[0].timeout_seconds,
      baseDelaySeconds: input.baseDelaySeconds ?? before.rows[0].base_delay_seconds,
      maxDelaySeconds: input.maxDelaySeconds ?? before.rows[0].max_delay_seconds,
    };
    const updated = await client.query(
      `update outbound_webhook_subscriptions set name=$3,endpoint_url=$4,event_types=$5,
       secret_ref=$6,status=$7,max_attempts=$8,timeout_seconds=$9,base_delay_seconds=$10,
       max_delay_seconds=$11,updated_by=$12,version=version+1,updated_at=now()
       where organization_id=$1 and id=$2 returning *,version::text`,
      [
        context.organizationId,
        id,
        next.name,
        next.endpointUrl,
        next.eventTypes,
        next.secretRef,
        next.status,
        next.maxAttempts,
        next.timeoutSeconds,
        next.baseDelaySeconds,
        next.maxDelaySeconds,
        context.actorId,
      ],
    );
    await this.audit(
      context,
      "outbound_subscription",
      id,
      expectedVersion + 1n,
      "updated",
      this.redactSubscription(updated.rows[0]),
      this.redactSubscription(before.rows[0]),
      client,
    );
    await client.query("commit");
    return updated.rows[0];
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function recordAttemptOperation(
  this: PgOutboundEventStore,
  workerId: string,
  delivery: Pick<LeasedOutboundDelivery, "organizationId" | "deliveryId" | "correlationId">,
  result: OutboundAttemptResult,
) {
  const client = await this.pool.connect();
  try {
    await client.query("begin");
    const locked = await client.query(
      `select d.*,s.max_attempts,s.base_delay_seconds,s.max_delay_seconds
       from outbound_deliveries d join outbound_webhook_subscriptions s
        on s.organization_id=d.organization_id and s.id=d.subscription_id
       where d.organization_id=$1 and d.id=$2 for update of d`,
      [delivery.organizationId, delivery.deliveryId],
    );
    const row = locked.rows[0];
    if (!row) throw new Error("RESOURCE_NOT_FOUND");
    if (row.state !== "leased" || row.leased_by !== workerId)
      throw new Error("DELIVERY_LEASE_LOST");
    const attemptNumber = row.attempt_count + 1;
    const exhausted = attemptNumber >= row.max_attempts;
    const delivered = result.outcome === "delivered";
    const deadLetter = !delivered && (result.outcome === "permanent_failure" || exhausted);
    const delaySeconds = Math.min(
      row.max_delay_seconds,
      row.base_delay_seconds * 2 ** Math.max(0, attemptNumber - 1),
    );
    const nextRetryAt = delivered || deadLetter ? null : new Date(Date.now() + delaySeconds * 1000);
    await client.query(
      `insert into outbound_delivery_attempts
       (organization_id,id,delivery_id,attempt_number,outcome,worker_id,http_status,response_summary,
        error_code,error_summary,next_retry_at,is_manual_replay,replay_actor_id,replay_reason,
        correlation_id,started_at,completed_at)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,greatest($16::timestamptz,now()))`,
      [
        delivery.organizationId,
        randomUUID(),
        delivery.deliveryId,
        attemptNumber,
        result.outcome,
        workerId,
        result.httpStatus ?? null,
        result.responseSummary?.slice(0, 2000) ?? null,
        result.errorCode ?? null,
        result.errorSummary?.slice(0, 1000) ?? null,
        nextRetryAt,
        result.isManualReplay ?? false,
        result.replayActorId ?? null,
        result.replayReason ?? null,
        delivery.correlationId,
        new Date(result.startedAt),
      ],
    );
    const state = delivered ? "delivered" : deadLetter ? "dead_letter" : "retry_scheduled";
    await client.query(
      `update outbound_deliveries set state=$3,attempt_count=$4,next_attempt_at=coalesce($5,next_attempt_at),
       leased_by=null,lease_expires_at=null,delivered_at=case when $3='delivered' then now() else delivered_at end,
       dead_lettered_at=case when $3='dead_letter' then now() else null end,last_http_status=$6,
       last_error_code=$7,last_error_summary=$8,updated_at=now()
       where organization_id=$1 and id=$2`,
      [
        delivery.organizationId,
        delivery.deliveryId,
        state,
        attemptNumber,
        nextRetryAt,
        result.httpStatus ?? null,
        result.errorCode ?? null,
        result.errorSummary?.slice(0, 1000) ?? null,
      ],
    );
    await client.query("commit");
    return { deliveryId: delivery.deliveryId, state, attemptNumber, nextRetryAt };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function createEndpointOperation(
  this: PgOutboundEventStore,
  context: OutboundStoreContext,
  input: CreateOutboundEndpointInput,
  idempotencyKey: string,
) {
  const client = await this.pool.connect();
  const operation = "outbound_endpoint.create";
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
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
    const id = input.id ?? randomUUID();
    const result = await client.query(
      `insert into outbound_webhook_subscriptions
       (organization_id,id,name,endpoint_url,event_types,secret_ref,max_attempts,timeout_seconds,
        base_delay_seconds,max_delay_seconds,created_by,updated_by)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
       returning id,name,endpoint_url,event_types,status,max_attempts,timeout_seconds,
        base_delay_seconds,max_delay_seconds,version::text,created_at,updated_at`,
      [
        context.organizationId,
        id,
        input.name.trim(),
        input.endpointUrl,
        JSON.stringify([...new Set(input.eventTypes)]),
        input.secretRef.trim(),
        input.maxAttempts ?? 8,
        input.timeoutSeconds ?? 15,
        input.baseDelaySeconds ?? 30,
        input.maxDelaySeconds ?? 3600,
        context.actorId,
      ],
    );
    const auditEventId = randomUUID();
    await client.query(
      `insert into resource_audit_events
       (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,
        correlation_id,after_state) values($1,$2,'outbound_endpoint',$3,1,'created',$4,$5,$6)`,
      [
        context.organizationId,
        auditEventId,
        id,
        context.actorId,
        context.correlationId,
        result.rows[0],
      ],
    );
    const response = {
      ...result.rows[0],
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
