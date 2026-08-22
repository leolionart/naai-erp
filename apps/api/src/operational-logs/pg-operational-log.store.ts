import { Injectable } from "@nestjs/common";
import pg from "pg";
import type { OperationalLogFilters, OperationalLogStore } from "./operational-log.types.js";

@Injectable()
export class PgOperationalLogStore implements OperationalLogStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
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
  async purgeExpired(now: Date, limit = 1000) {
    const result = await this.pool.query(
      "delete from operational_activity_logs where expires_at < $1 and ctid in (select ctid from operational_activity_logs where expires_at < $1 limit $2) returning id",
      [now, limit],
    );
    return result.rowCount ?? 0;
  }
}
