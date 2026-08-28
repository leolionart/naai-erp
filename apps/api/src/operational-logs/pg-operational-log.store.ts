import { Injectable } from "@nestjs/common";
import pg from "pg";
import type {
  OperationalLogFilters,
  OperationalLogStore,
  UnifiedActivityFilters,
} from "./operational-log.types.js";

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return undefined;
  try {
    const [occurredAt, source, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    if (!occurredAt || !source || !id || Number.isNaN(new Date(occurredAt).valueOf()))
      return undefined;
    return { occurredAt, source, id };
  } catch {
    return undefined;
  }
}

function encodeCursor(row: Record<string, unknown>) {
  const occurredAt = row.occurred_at;
  const timestamp = occurredAt instanceof Date ? occurredAt.toISOString() : String(occurredAt);
  return Buffer.from(`${timestamp}|${String(row.source)}|${String(row.id)}`).toString("base64url");
}

@Injectable()
export class PgOperationalLogStore implements OperationalLogStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  async start(input: {
    organizationId: string;
    id: string;
    service: string;
    operation: string;
    correlationId?: string | null;
    summary: string;
    details?: unknown;
  }) {
    await this.pool.query(
      `insert into operational_activity_logs (organization_id,id,service,operation,status,severity,correlation_id,summary,details,started_at,expires_at)
       values ($1,$2,$3,$4,'running','info',$5,$6,$7,now(),now()+interval '30 days')`,
      [
        input.organizationId,
        input.id,
        input.service,
        input.operation,
        input.correlationId ?? null,
        input.summary,
        input.details ?? {},
      ],
    );
  }
  async finish(
    organizationId: string,
    id: string,
    result: {
      status: "succeeded" | "failed";
      severity?: "info" | "warning" | "error";
      summary?: string;
      details?: unknown;
    },
  ) {
    await this.pool.query(
      `update operational_activity_logs set status=$3,severity=coalesce($4,severity),summary=coalesce($5,summary),details=coalesce($6,details),completed_at=now() where organization_id=$1 and id=$2`,
      [
        organizationId,
        id,
        result.status,
        result.severity ?? null,
        result.summary ?? null,
        result.details ?? null,
      ],
    );
  }
  async list(organizationId: string, filters: OperationalLogFilters) {
    const values: unknown[] = [organizationId];
    const where = ["organization_id=$1"];
    for (const [column, value] of [
      ["status", filters.status],
      ["service", filters.service],
      ["severity", filters.severity],
    ] as const) {
      if (value) {
        values.push(value);
        where.push(`${column}=$${values.length}`);
      }
    }
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
    values.push(limit + 1);
    const result = await this.pool.query(
      `select id,service,operation,status,severity,worker_id,correlation_id,summary,details,started_at,completed_at,expires_at,created_at from operational_activity_logs where ${where.join(" and ")} order by created_at desc,id desc limit $${values.length}`,
      values,
    );
    return {
      items: result.rows.slice(0, limit),
      ...(result.rows.length > limit
        ? { nextCursor: result.rows[limit - 1]?.created_at?.toISOString() }
        : {}),
    };
  }
  async listAll(organizationId: string, filters: UnifiedActivityFilters) {
    const values: unknown[] = [organizationId];
    const where = ["organization_id=$1"];
    for (const [column, value] of [
      ["source", filters.source],
      ["event_type", filters.eventType],
      ["actor_id", filters.actorId],
      ["status", filters.status],
      ["severity", filters.severity],
    ] as const) {
      if (value) {
        values.push(value);
        where.push(`${column}=$${values.length}`);
      }
    }
    const cursor = decodeCursor(filters.cursor);
    if (filters.cursor && !cursor) throw new Error("VALIDATION_FAILED");
    if (cursor) {
      values.push(cursor.occurredAt, cursor.source, cursor.id);
      const position = values.length;
      where.push(
        `(occurred_at,source,id) < ($${position - 2}::timestamptz,$${position - 1},$${position})`,
      );
    }
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
    values.push(limit + 1);
    const result = await this.pool.query(
      `select * from (
         select organization_id,id,'operational'::text source,operation event_type,
           null::text actor_id,service resource_type,null::text resource_key,
           correlation_id,status,severity,summary,
           jsonb_build_object('workerId',worker_id,'details',details,'startedAt',started_at,
             'completedAt',completed_at,'expiresAt',expires_at) details,
           created_at occurred_at
         from operational_activity_logs
         union all
         select organization_id,id,'resource_audit'::text source,action event_type,
           actor_id,resource_type,resource_key,correlation_id,'succeeded'::text status,
           'info'::text severity,resource_type||' · '||action summary,
           jsonb_build_object('resourceVersion',resource_version) details,occurred_at
         from resource_audit_events
         union all
         select organization_id,id,'planning_audit'::text source,action event_type,
           actor_id,resource_type,resource_id resource_key,correlation_id,'succeeded'::text status,
           'info'::text severity,resource_type||' · '||action summary,
           jsonb_build_object('resourceVersion',resource_version,'reason',reason) details,occurred_at
         from planning_audit_events
       ) activity where ${where.join(" and ")}
       order by occurred_at desc,source desc,id desc limit $${values.length}`,
      values,
    );
    const items = result.rows.slice(0, limit);
    return {
      items,
      ...(result.rows.length > limit && items.length
        ? { nextCursor: encodeCursor(items[items.length - 1] as Record<string, unknown>) }
        : {}),
    };
  }
  async purgeExpired(now: Date, limit = 1000) {
    const result = await this.pool.query(
      "delete from operational_activity_logs where expires_at < $1 and ctid in (select ctid from operational_activity_logs where expires_at < $1 limit $2) returning id",
      [now, limit],
    );
    return result.rowCount ?? 0;
  }
  async listEvents(organizationId: string, activityId: string) {
    const result = await this.pool.query(
      `select sequence, occurred_at, phase, level, message, attempt, correlation_id, metadata
       from operational_activity_log_events
       where organization_id=$1 and activity_id=$2
       order by sequence asc, occurred_at asc`,
      [organizationId, activityId],
    );
    return { items: result.rows };
  }
}
