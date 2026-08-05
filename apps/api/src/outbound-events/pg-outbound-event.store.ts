import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg, { type PoolClient } from "pg";
import type {
  LeasedOutboundDelivery,
  OutboundAttemptResult,
  OutboundStoreContext,
  OutboundSubscriptionInput,
} from "./outbound-event.store.types.js";
import type {
  OutboundDeliveryFilters,
  CreateOutboundEndpointInput,
  OutboundEndpointFilters,
  OutboxEventFilters,
  ReplayOutboundEventInput,
  UpdateOutboundEndpointInput,
} from "./outbound-event.types.js";

@Injectable()
export class PgOutboundEventStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  async listSubscriptions(organizationId: string) {
    const result = await this.pool.query(
      `select id,name,endpoint_url,event_types,status,max_attempts,timeout_seconds,
        base_delay_seconds,max_delay_seconds,version::text,created_at,updated_at
       from outbound_webhook_subscriptions where organization_id=$1 order by name,id`,
      [organizationId],
    );
    return result.rows;
  }

  async createSubscription(context: OutboundStoreContext, input: OutboundSubscriptionInput) {
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

  async updateSubscription(
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

  async enqueueOutboxEvent(organizationId: string, outboxEventId: string) {
    const result = await this.pool.query(
      `insert into outbound_deliveries(organization_id,id,outbox_event_id,subscription_id)
       select e.organization_id,e.id||':'||s.id,e.id,s.id
       from outbox_events e join outbound_webhook_subscriptions s
         on s.organization_id=e.organization_id and s.status='active' and s.event_types ? e.event_type
       where e.organization_id=$1 and e.id=$2
       on conflict (organization_id,outbox_event_id,subscription_id) do nothing
       returning id,subscription_id,state`,
      [organizationId, outboxEventId],
    );
    return result.rows;
  }

  async fanOutPendingOutboxEvents(limit = 100) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const events = await client.query<{ organization_id: string; id: string }>(
        `select organization_id,id from outbox_events where published_at is null
         order by occurred_at,id for update skip locked limit $1`,
        [Math.max(1, Math.min(limit, 500))],
      );
      let deliveryCount = 0;
      for (const event of events.rows) {
        const deliveries = await client.query(
          `insert into outbound_deliveries(organization_id,id,outbox_event_id,subscription_id)
           select e.organization_id,e.id||':'||s.id,e.id,s.id
           from outbox_events e join outbound_webhook_subscriptions s
             on s.organization_id=e.organization_id and s.status='active' and s.event_types ? e.event_type
           where e.organization_id=$1 and e.id=$2
           on conflict (organization_id,outbox_event_id,subscription_id) do nothing returning id`,
          [event.organization_id, event.id],
        );
        deliveryCount += deliveries.rowCount ?? 0;
        await client.query(
          "update outbox_events set published_at=now() where organization_id=$1 and id=$2",
          [event.organization_id, event.id],
        );
      }
      await client.query("commit");
      return { eventCount: events.rowCount ?? 0, deliveryCount };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async leaseDue(
    workerId: string,
    limit = 25,
    leaseSeconds = 60,
  ): Promise<LeasedOutboundDelivery[]> {
    const result = await this.pool.query(
      `with due as (
         select d.organization_id,d.id from outbound_deliveries d
         join outbound_webhook_subscriptions s on s.organization_id=d.organization_id and s.id=d.subscription_id
         where d.state in ('pending','retry_scheduled') and d.next_attempt_at<=now() and s.status='active'
         order by d.next_attempt_at,d.created_at for update of d skip locked limit $1
       ), leased as (
         update outbound_deliveries d set state='leased',leased_by=$2,
           lease_expires_at=now()+make_interval(secs=>$3),updated_at=now()
         from due where d.organization_id=due.organization_id and d.id=due.id
         returning d.*
       )
       select d.organization_id,d.id delivery_id,d.outbox_event_id,d.subscription_id,
         s.endpoint_url,s.secret_ref,s.timeout_seconds,e.event_type,e.schema_version,e.payload,
         e.correlation_id,e.occurred_at,d.attempt_count+1 attempt_number,d.lease_expires_at
       from leased d join outbound_webhook_subscriptions s
         on s.organization_id=d.organization_id and s.id=d.subscription_id
       join outbox_events e on e.organization_id=d.organization_id and e.id=d.outbox_event_id
       order by d.next_attempt_at,d.created_at`,
      [Math.max(1, Math.min(limit, 200)), workerId, Math.max(5, leaseSeconds)],
    );
    return result.rows.map((row) => ({
      organizationId: row.organization_id,
      deliveryId: row.delivery_id,
      outboxEventId: row.outbox_event_id,
      subscriptionId: row.subscription_id,
      endpointUrl: row.endpoint_url,
      secretRef: row.secret_ref,
      timeoutSeconds: row.timeout_seconds,
      eventType: row.event_type,
      schemaVersion: row.schema_version,
      payload: row.payload,
      correlationId: row.correlation_id,
      occurredAt: new Date(row.occurred_at).toISOString(),
      attemptNumber: row.attempt_number,
      leaseExpiresAt: new Date(row.lease_expires_at).toISOString(),
    }));
  }

  async recordAttempt(
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
      const nextRetryAt =
        delivered || deadLetter ? null : new Date(Date.now() + delaySeconds * 1000);
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

  async releaseExpiredLeases(workerId = "lease-reaper") {
    const expired = await this.pool.query<{
      organization_id: string;
      id: string;
      correlation_id: string;
      leased_by: string;
    }>(
      `select d.organization_id,d.id,d.leased_by,e.correlation_id from outbound_deliveries d
       join outbox_events e on e.organization_id=d.organization_id and e.id=d.outbox_event_id
       where d.state='leased' and d.lease_expires_at<now() order by d.lease_expires_at limit 200`,
    );
    for (const row of expired.rows) {
      try {
        await this.recordAttempt(
          row.leased_by ?? workerId,
          {
            organizationId: row.organization_id,
            deliveryId: row.id,
            correlationId: row.correlation_id,
          },
          {
            outcome: "lease_expired",
            startedAt: new Date().toISOString(),
            errorCode: "LEASE_EXPIRED",
            errorSummary: "Worker lease expired before completion",
          },
        );
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "DELIVERY_LEASE_LOST") throw error;
      }
    }
    return expired.rowCount ?? 0;
  }

  async manualReplay(context: OutboundStoreContext, deliveryId: string, reason: string) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const before = await client.query(
        "select * from outbound_deliveries where organization_id=$1 and id=$2 for update",
        [context.organizationId, deliveryId],
      );
      if (!before.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      if (!reason.trim()) throw new Error("REPLAY_REASON_REQUIRED");
      if (!["dead_letter", "retry_scheduled"].includes(before.rows[0].state))
        throw new Error("REPLAY_NOT_ALLOWED");
      const updated = await client.query(
        `update outbound_deliveries set state='pending',next_attempt_at=now(),leased_by=null,
         lease_expires_at=null,dead_lettered_at=null,manual_replay_count=manual_replay_count+1,updated_at=now()
         where organization_id=$1 and id=$2 returning *`,
        [context.organizationId, deliveryId],
      );
      await this.audit(
        context,
        "outbound_delivery",
        deliveryId,
        BigInt(updated.rows[0].attempt_count + 1),
        "manual_replay",
        { state: "pending", reason: reason.trim() },
        before.rows[0],
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

  async listDeliveriesByState(organizationId: string, state?: string) {
    const result = await this.pool.query(
      `select d.*,e.event_type,e.schema_version,s.name subscription_name,s.endpoint_url
       from outbound_deliveries d join outbox_events e on e.organization_id=d.organization_id and e.id=d.outbox_event_id
       join outbound_webhook_subscriptions s on s.organization_id=d.organization_id and s.id=d.subscription_id
       where d.organization_id=$1 and ($2::text is null or d.state::text=$2)
       order by d.created_at desc,d.id`,
      [organizationId, state ?? null],
    );
    return result.rows;
  }

  async delivery(organizationId: string, id: string) {
    const item = await this.pool.query(
      "select * from outbound_deliveries where organization_id=$1 and id=$2",
      [organizationId, id],
    );
    if (!item.rows[0]) return undefined;
    const attempts = await this.pool.query(
      `select attempt_number,outcome,worker_id,http_status,response_summary,error_code,error_summary,
       next_retry_at,is_manual_replay,replay_actor_id,replay_reason,correlation_id,started_at,completed_at
       from outbound_delivery_attempts where organization_id=$1 and delivery_id=$2 order by attempt_number`,
      [organizationId, id],
    );
    return { ...item.rows[0], attempts: attempts.rows };
  }

  async listEndpoints(organizationId: string, filters: OutboundEndpointFilters) {
    const limit = Math.max(1, Math.min(filters.limit ?? 50, 200));
    const result = await this.pool.query(
      `select id,name,endpoint_url,event_types,status,max_attempts,timeout_seconds,
       base_delay_seconds,max_delay_seconds,version::text,created_at,updated_at
       from outbound_webhook_subscriptions
       where organization_id=$1 and ($2::text is null or status::text=$2)
         and ($3::text is null or event_types ? $3)
         and ($4::text is null or id>$4)
       order by id limit $5`,
      [
        organizationId,
        filters.status ?? null,
        filters.eventType ?? null,
        filters.cursor ?? null,
        limit,
      ],
    );
    return {
      items: result.rows,
      nextCursor: result.rows.length === limit ? result.rows.at(-1)?.id : null,
    };
  }

  async getEndpoint(organizationId: string, endpointId: string) {
    const result = await this.pool.query(
      `select id,name,endpoint_url,event_types,status,max_attempts,timeout_seconds,
       base_delay_seconds,max_delay_seconds,version::text,created_at,updated_at
       from outbound_webhook_subscriptions where organization_id=$1 and id=$2`,
      [organizationId, endpointId],
    );
    return result.rows[0];
  }

  async createEndpoint(
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

  async updateEndpoint(
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

  async listOutbox(organizationId: string, filters: OutboxEventFilters) {
    const limit = Math.max(1, Math.min(filters.limit ?? 50, 200));
    const result = await this.pool.query(
      `select e.id,e.aggregate_type,e.aggregate_id,e.event_type,e.schema_version,e.payload,
       e.correlation_id,e.occurred_at,e.published_at,
       case when count(d.id)=0 then 'unsubscribed'
         when bool_and(d.state='delivered') then 'delivered'
         when bool_or(d.state='dead_letter') then 'dead_letter' else 'pending' end state,
       count(d.id)::int delivery_count
       from outbox_events e left join outbound_deliveries d
         on d.organization_id=e.organization_id and d.outbox_event_id=e.id
       where e.organization_id=$1 and ($2::text is null or e.event_type=$2)
         and ($3::text is null or e.aggregate_type=$3) and ($4::text is null or e.aggregate_id=$4)
         and ($5::text is null or e.id>$5)
       group by e.organization_id,e.id
       having ($6::text is null or
         (case when count(d.id)=0 then 'unsubscribed'
          when bool_and(d.state='delivered') then 'delivered'
          when bool_or(d.state='dead_letter') then 'dead_letter' else 'pending' end)=$6)
       order by e.id limit $7`,
      [
        organizationId,
        filters.eventType ?? null,
        filters.aggregateType ?? null,
        filters.aggregateId ?? null,
        filters.cursor ?? null,
        filters.state ?? null,
        limit,
      ],
    );
    return {
      items: result.rows,
      nextCursor: result.rows.length === limit ? result.rows.at(-1)?.id : null,
    };
  }

  async getOutboxEvent(organizationId: string, eventId: string) {
    const event = await this.pool.query(
      `select id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id,
       occurred_at,published_at from outbox_events where organization_id=$1 and id=$2`,
      [organizationId, eventId],
    );
    if (!event.rows[0]) return undefined;
    const deliveries = await this.pool.query(
      `select d.id,d.subscription_id,d.state,d.attempt_count,d.next_attempt_at,d.delivered_at,
       d.dead_lettered_at,d.last_http_status,d.last_error_code,d.last_error_summary,
       d.manual_replay_count,s.name endpoint_name,s.endpoint_url
       from outbound_deliveries d join outbound_webhook_subscriptions s
         on s.organization_id=d.organization_id and s.id=d.subscription_id
       where d.organization_id=$1 and d.outbox_event_id=$2 order by d.id`,
      [organizationId, eventId],
    );
    return { ...event.rows[0], deliveries: deliveries.rows };
  }

  async listDeliveries(organizationId: string, filters: OutboundDeliveryFilters) {
    const limit = Math.max(1, Math.min(filters.limit ?? 50, 200));
    const result = await this.pool.query(
      `select d.id,d.outbox_event_id,d.subscription_id,d.state,d.attempt_count,d.next_attempt_at,
       d.delivered_at,d.dead_lettered_at,d.last_http_status,d.last_error_code,d.last_error_summary,
       d.manual_replay_count,d.created_at,d.updated_at,e.event_type,e.schema_version,
       s.name endpoint_name,s.endpoint_url
       from outbound_deliveries d join outbox_events e
         on e.organization_id=d.organization_id and e.id=d.outbox_event_id
       join outbound_webhook_subscriptions s
         on s.organization_id=d.organization_id and s.id=d.subscription_id
       where d.organization_id=$1 and ($2::text is null or d.outbox_event_id=$2)
         and ($3::text is null or d.subscription_id=$3) and ($4::text is null or d.state::text=$4)
         and ($5::text is null or d.id>$5) order by d.id limit $6`,
      [
        organizationId,
        filters.outboxEventId ?? null,
        filters.endpointId ?? null,
        filters.state ?? null,
        filters.cursor ?? null,
        limit,
      ],
    );
    return {
      items: result.rows,
      nextCursor: result.rows.length === limit ? result.rows.at(-1)?.id : null,
    };
  }

  async getDelivery(organizationId: string, deliveryId: string) {
    return this.delivery(organizationId, deliveryId);
  }

  async replay(
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

  private async audit(
    context: OutboundStoreContext,
    resourceType: string,
    resourceKey: string,
    version: bigint,
    action: string,
    afterState: unknown,
    beforeState?: unknown,
    client?: PoolClient,
  ) {
    const runner = client ?? this.pool;
    await runner.query(
      `insert into resource_audit_events
       (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        context.organizationId,
        randomUUID(),
        resourceType,
        resourceKey,
        version.toString(),
        action,
        context.actorId,
        context.correlationId,
        beforeState ?? null,
        afterState ?? null,
      ],
    );
  }

  private async idempotent(
    client: PoolClient,
    organizationId: string,
    key: string,
    operation: string,
    requestHash: string,
  ) {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${organizationId}:${key}`,
    ]);
    const prior = await client.query<{
      operation: string;
      request_hash: string;
      response_body: Record<string, unknown>;
    }>(
      `select operation,request_hash,response_body from api_idempotency_records
       where organization_id=$1 and idempotency_key=$2`,
      [organizationId, key],
    );
    if (!prior.rows[0]) return undefined;
    if (prior.rows[0].operation !== operation || prior.rows[0].request_hash !== requestHash)
      throw new Error("IDEMPOTENCY_CONFLICT");
    return prior.rows[0].response_body;
  }

  private async saveIdempotent(
    client: PoolClient,
    organizationId: string,
    key: string,
    operation: string,
    requestHash: string,
    response: Record<string, unknown>,
  ) {
    await client.query(
      `insert into api_idempotency_records
       (organization_id,idempotency_key,operation,request_hash,response_body) values($1,$2,$3,$4,$5)`,
      [organizationId, key, operation, requestHash, response],
    );
  }

  private redactSubscription(row: Record<string, unknown>) {
    const safe = { ...row };
    delete safe.secret_ref;
    return safe;
  }
}
