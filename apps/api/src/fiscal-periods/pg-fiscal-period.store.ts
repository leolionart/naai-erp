import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg from "pg";
import type { ActorContext } from "../master-data/master-data.types.js";

export type PeriodCommandInput = Readonly<{
  fiscalYear: number;
  periodNumber: number;
  targetState: "open" | "soft_locked" | "hard_locked";
  reason: string;
}>;

@Injectable()
export class PgFiscalPeriodStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  async transition(
    action: "close" | "reopen",
    context: ActorContext,
    input: PeriodCommandInput,
    idempotencyKey: string,
  ) {
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ action, input }))
      .digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${context.organizationId}:${idempotencyKey}`,
      ]);
      const replay = await client.query<{
        request_hash: string;
        response_body: Record<string, unknown>;
      }>(
        "select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2 for update",
        [context.organizationId, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
        await client.query("rollback");
        return { ...replay.rows[0].response_body, idempotencyReplayed: true };
      }
      const period = await client.query<{ state: "open" | "soft_locked" | "hard_locked" }>(
        `select state from fiscal_periods
         where organization_id=$1 and fiscal_year=$2 and period_number=$3 for update`,
        [context.organizationId, input.fiscalYear, input.periodNumber],
      );
      const current = period.rows[0];
      if (!current) throw new Error("RESOURCE_NOT_FOUND");
      const expected =
        action === "close"
          ? current.state === "open"
            ? "soft_locked"
            : current.state === "soft_locked"
              ? "hard_locked"
              : undefined
          : current.state === "hard_locked"
            ? "soft_locked"
            : current.state === "soft_locked"
              ? "open"
              : undefined;
      if (!expected || input.targetState !== expected) throw new Error("INVALID_PERIOD_TRANSITION");
      await client.query("select set_config('naai.period_transition_authorized','on',true)");
      await client.query(
        `update fiscal_periods set state=$4,updated_at=now()
         where organization_id=$1 and fiscal_year=$2 and period_number=$3`,
        [context.organizationId, input.fiscalYear, input.periodNumber, input.targetState],
      );
      const resourceKey = Buffer.from(
        JSON.stringify({ fiscal_year: input.fiscalYear, period_number: input.periodNumber }),
      ).toString("base64url");
      const versionResult = await client.query<{ version: string }>(
        `insert into resource_versions (organization_id,resource_type,resource_key,version)
         values ($1,'fiscal-periods',$2,1)
         on conflict (organization_id,resource_type,resource_key)
         do update set version=resource_versions.version+1,updated_at=now()
         returning version`,
        [context.organizationId, resourceKey],
      );
      const version = versionResult.rows[0]!.version;
      const eventId = randomUUID();
      const auditEventId = randomUUID();
      const outboxEventId = randomUUID();
      await client.query(
        `insert into fiscal_period_events
         (organization_id,id,fiscal_year,period_number,action,from_state,to_state,actor_id,reason,correlation_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          context.organizationId,
          eventId,
          input.fiscalYear,
          input.periodNumber,
          action,
          current.state,
          input.targetState,
          context.actorId,
          input.reason,
          context.correlationId,
        ],
      );
      await client.query(
        `insert into resource_audit_events
         (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
         values ($1,$2,'fiscal-periods',$3,$4,$5,$6,$7,$8,$9)`,
        [
          context.organizationId,
          auditEventId,
          resourceKey,
          version,
          action,
          context.actorId,
          context.correlationId,
          { state: current.state },
          { state: input.targetState, reason: input.reason, eventId },
        ],
      );
      await client.query(
        `insert into outbox_events
         (organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)
         values ($1,$2,'fiscal-period',$3,$4,1,$5,$6)`,
        [
          context.organizationId,
          outboxEventId,
          `${input.fiscalYear}:${input.periodNumber}`,
          action === "close" ? "fiscal-period.closed" : "fiscal-period.reopened",
          {
            fiscalYear: input.fiscalYear,
            periodNumber: input.periodNumber,
            state: input.targetState,
          },
          context.correlationId,
        ],
      );
      const response = {
        fiscalYear: input.fiscalYear,
        periodNumber: input.periodNumber,
        state: input.targetState,
        resourceVersion: version,
        periodEventId: eventId,
        auditEventId,
        outboxEventId,
        nextActions:
          input.targetState === "open"
            ? ["close"]
            : input.targetState === "hard_locked"
              ? ["reopen"]
              : ["close", "reopen"],
      };
      await client.query(
        `insert into api_idempotency_records
         (organization_id,idempotency_key,operation,request_hash,response_body)
         values ($1,$2,$3,$4,$5)`,
        [context.organizationId, idempotencyKey, `fiscal-period:${action}`, requestHash, response],
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
}
