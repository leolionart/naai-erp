import { randomUUID } from "node:crypto";
import pg from "pg";
import type {
  DeliveryCompletion,
  LeasedOutboundDelivery,
  OutboundDeliveryStore,
} from "./outbound-delivery.js";

export class PgOutboundDeliveryStore implements OutboundDeliveryStore {
  private readonly pool: pg.Pool;

  constructor(connectionString = process.env.DATABASE_URL) {
    this.pool = new pg.Pool({ connectionString });
  }

  async close() {
    await this.pool.end();
  }

  async materializePending(limit: number) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const events = await client.query<{ organization_id: string; id: string }>(
        `select organization_id,id from outbox_events
         where published_at is null order by occurred_at,id for update skip locked limit $1`,
        [Math.max(1, Math.min(limit, 1000))],
      );
      let created = 0;
      for (const event of events.rows) {
        const inserted = await client.query(
          `insert into outbound_deliveries(organization_id,id,outbox_event_id,subscription_id)
           select e.organization_id,e.id||':'||s.id,e.id,s.id
           from outbox_events e join outbound_webhook_subscriptions s
             on s.organization_id=e.organization_id and s.status='active' and s.event_types ? e.event_type
           where e.organization_id=$1 and e.id=$2
           on conflict (organization_id,outbox_event_id,subscription_id) do nothing`,
          [event.organization_id, event.id],
        );
        created += inserted.rowCount ?? 0;
        await client.query(
          "update outbox_events set published_at=now() where organization_id=$1 and id=$2",
          [event.organization_id, event.id],
        );
      }
      await client.query("commit");
      return created;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async releaseExpiredLeases(now: Date) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const expired = await client.query<{
        organization_id: string;
        id: string;
        attempt_count: number;
        correlation_id: string;
      }>(
        `select d.organization_id,d.id,d.attempt_count,e.correlation_id
         from outbound_deliveries d join outbox_events e
           on e.organization_id=d.organization_id and e.id=d.outbox_event_id
         where d.state='leased' and d.lease_expires_at<$1
         order by d.lease_expires_at for update of d skip locked limit 200`,
        [now],
      );
      for (const row of expired.rows) {
        const attemptNumber = row.attempt_count + 1;
        await client.query(
          `insert into outbound_delivery_attempts
           (organization_id,id,delivery_id,attempt_number,outcome,worker_id,error_code,error_summary,
            next_retry_at,correlation_id,started_at,completed_at)
           values($1,$2,$3,$4,'lease_expired','lease-reaper','LEASE_EXPIRED',
            'Worker lease expired before completion',$5,$6,$5,$5)`,
          [row.organization_id, randomUUID(), row.id, attemptNumber, now, row.correlation_id],
        );
        await client.query(
          `update outbound_deliveries set state='retry_scheduled',attempt_count=$3,
           next_attempt_at=$4,leased_by=null,lease_expires_at=null,last_error_code='LEASE_EXPIRED',
           last_error_summary='Worker lease expired before completion',updated_at=$4
           where organization_id=$1 and id=$2`,
          [row.organization_id, row.id, attemptNumber, now],
        );
      }
      await client.query("commit");
      return expired.rowCount ?? 0;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async leaseDue(input: {
    now: Date;
    workerId: string;
    limit: number;
    leaseSeconds: number;
  }): Promise<readonly LeasedOutboundDelivery[]> {
    const result = await this.pool.query(
      `with due as (
         select d.organization_id,d.id from outbound_deliveries d
         join outbound_webhook_subscriptions s
           on s.organization_id=d.organization_id and s.id=d.subscription_id
         where d.state in ('pending','retry_scheduled') and d.next_attempt_at<=$1 and s.status='active'
         order by d.next_attempt_at,d.created_at for update of d skip locked limit $2
       ), leased as (
         update outbound_deliveries d set state='leased',leased_by=$3,
           lease_expires_at=$1+make_interval(secs=>$4),updated_at=$1
         from due where d.organization_id=due.organization_id and d.id=due.id returning d.*
       )
       select d.organization_id,d.id delivery_id,d.outbox_event_id,s.endpoint_url,s.secret_ref,
         s.timeout_seconds,s.max_attempts,s.base_delay_seconds,s.max_delay_seconds,
         e.event_type,e.schema_version,e.payload,e.correlation_id,e.occurred_at,
         d.attempt_count+1 attempt_number
       from leased d join outbound_webhook_subscriptions s
         on s.organization_id=d.organization_id and s.id=d.subscription_id
       join outbox_events e on e.organization_id=d.organization_id and e.id=d.outbox_event_id
       order by d.next_attempt_at,d.created_at`,
      [
        input.now,
        Math.max(1, Math.min(input.limit, 200)),
        input.workerId,
        Math.max(5, input.leaseSeconds),
      ],
    );
    return result.rows.map((row) => ({
      organizationId: row.organization_id,
      deliveryId: row.delivery_id,
      outboxEventId: row.outbox_event_id,
      eventType: row.event_type,
      schemaVersion: row.schema_version,
      payload: row.payload,
      correlationId: row.correlation_id,
      occurredAt: new Date(row.occurred_at).toISOString(),
      endpointUrl: row.endpoint_url,
      secretRef: row.secret_ref,
      attemptNumber: row.attempt_number,
      maxAttempts: row.max_attempts,
      timeoutSeconds: row.timeout_seconds,
      baseDelaySeconds: row.base_delay_seconds,
      maxDelaySeconds: row.max_delay_seconds,
    }));
  }

  async complete(
    delivery: LeasedOutboundDelivery,
    workerId: string,
    completion: DeliveryCompletion,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const current = await client.query<{
        state: string;
        leased_by: string;
        attempt_count: number;
      }>(
        `select state,leased_by,attempt_count from outbound_deliveries
         where organization_id=$1 and id=$2 for update`,
        [delivery.organizationId, delivery.deliveryId],
      );
      if (!current.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      if (current.rows[0].state !== "leased" || current.rows[0].leased_by !== workerId)
        throw new Error("DELIVERY_LEASE_LOST");
      const attemptNumber = current.rows[0].attempt_count + 1;
      const state =
        completion.outcome === "delivered"
          ? "delivered"
          : completion.outcome === "retryable_failure" && completion.nextRetryAt
            ? "retry_scheduled"
            : "dead_letter";
      const recordedAt = new Date();
      await client.query(
        `insert into outbound_delivery_attempts
         (organization_id,id,delivery_id,attempt_number,outcome,worker_id,http_status,response_summary,
          error_code,error_summary,next_retry_at,correlation_id,started_at,completed_at)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)`,
        [
          delivery.organizationId,
          randomUUID(),
          delivery.deliveryId,
          attemptNumber,
          completion.outcome,
          workerId,
          completion.httpStatus ?? null,
          completion.responseSummary?.slice(0, 2000) ?? null,
          completion.errorCode ?? null,
          completion.errorSummary?.slice(0, 1000) ?? null,
          completion.nextRetryAt ?? null,
          delivery.correlationId,
          recordedAt,
        ],
      );
      await client.query(
        `update outbound_deliveries set state=$3::outbound_delivery_state,attempt_count=$4,
         next_attempt_at=coalesce($5,next_attempt_at),leased_by=null,lease_expires_at=null,
         delivered_at=case when $3::text='delivered' then $6 else delivered_at end,
         dead_lettered_at=case when $3::text='dead_letter' then $6 else null end,
         last_http_status=$7,last_error_code=$8,last_error_summary=$9,updated_at=$6
         where organization_id=$1 and id=$2`,
        [
          delivery.organizationId,
          delivery.deliveryId,
          state,
          attemptNumber,
          completion.nextRetryAt ?? null,
          recordedAt,
          completion.httpStatus ?? null,
          completion.errorCode ?? null,
          completion.errorSummary?.slice(0, 1000) ?? null,
        ],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
