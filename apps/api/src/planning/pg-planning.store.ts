/* eslint-disable @typescript-eslint/no-explicit-any -- PostgreSQL rows are normalized at the store boundary. */
import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import {
  createForecastVersion,
  createRevenueTargetVersion,
  publishForecastVersion,
  publishRevenueTargetVersion,
  supersedeForecastVersion,
  supersedeRevenueTargetVersion,
  type ForecastVersion,
  type RevenueTargetVersion,
} from "@naai-erp/domain";
import pg, { type PoolClient } from "pg";
import type { PlanningContext, PlanningResource } from "./planning.types.js";

const TABLE: Record<PlanningResource, string> = {
  "revenue-targets": "revenue_target_versions",
  "forecast-versions": "forecast_versions",
};
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

@Injectable()
export class PgPlanningStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  async list(
    c: PlanningContext,
    resource: PlanningResource,
    filters: Record<string, string | undefined>,
  ) {
    const values: unknown[] = [c.organizationId];
    let where = "";
    const allowed =
      resource === "revenue-targets"
        ? {
            periodKind: "period_kind",
            actualBasis: "actual_basis",
            startsOn: "starts_on",
            endsOn: "ends_on",
            state: "state",
          }
        : {
            scenario: "scenario",
            snapshotKind: "snapshot_kind",
            actualBasis: "actual_basis",
            startsOn: "starts_on",
            endsOn: "ends_on",
            state: "state",
          };
    for (const [key, column] of Object.entries(allowed))
      if (filters[key]) {
        values.push(filters[key]);
        where += ` and ${column}=$${values.length}`;
      }
    return {
      items: (
        await this.pool.query(
          `${this.select(resource)} where organization_id=$1${where} order by starts_on desc,version_number desc,id`,
          values,
        )
      ).rows.map((row) => this.contract(resource, row)),
    };
  }

  async get(c: PlanningContext, resource: PlanningResource, id: string) {
    return this.getWith(this.pool, c.organizationId, resource, id);
  }

  create(
    c: PlanningContext,
    resource: PlanningResource,
    input: Record<string, unknown>,
    key: string,
  ) {
    return this.mutate(c, key, `${resource}:create`, input, async (q) => {
      const id = String(input.id ?? randomUUID());
      const existing = await this.existing(q, c.organizationId, resource);
      if (resource === "revenue-targets") {
        const target = createRevenueTargetVersion({
          organizationId: c.organizationId,
          id,
          versionNumber: Number(input.versionNumber),
          ...(input.previousVersionId
            ? { previousVersionId: String(input.previousVersionId) }
            : {}),
          periodKind: input.periodKind as any,
          startsOn: String(input.startsOn),
          endsOn: String(input.endsOn),
          actualBasis: input.actualBasis as any,
          currency: String(input.currency),
          amountMinor: BigInt(String(input.amountMinor)),
          dimensions: this.dimensions(input.dimensions),
        });
        const { assertRevenueTargetVersionSequence } = await import("@naai-erp/domain");
        assertRevenueTargetVersionSequence(target, existing as RevenueTargetVersion[]);
        await q.query(
          `insert into revenue_target_versions(organization_id,id,version_number,previous_version_id,period_kind,starts_on,ends_on,actual_basis,currency,amount_minor,team_id,service_line_code,owner_id,reason,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            c.organizationId,
            id,
            target.versionNumber,
            target.previousVersionId ?? null,
            target.periodKind,
            target.startsOn,
            target.endsOn,
            target.actualBasis,
            target.currency,
            target.amountMinor,
            target.dimensions.teamId ?? null,
            target.dimensions.serviceLineCode ?? null,
            target.dimensions.ownerId ?? null,
            input.reason,
            c.actorId,
          ],
        );
      } else {
        const forecast = createForecastVersion({
          organizationId: c.organizationId,
          id,
          versionNumber: Number(input.versionNumber),
          ...(input.previousVersionId
            ? { previousVersionId: String(input.previousVersionId) }
            : {}),
          scenario: input.scenario as any,
          ...(input.customScenarioName
            ? { customScenarioName: String(input.customScenarioName) }
            : {}),
          snapshotKind: input.snapshotKind as any,
          asOfDate: String(input.asOfDate),
          startsOn: String(input.startsOn),
          endsOn: String(input.endsOn),
          actualBasis: input.actualBasis as any,
          currency: String(input.currency),
          dimensions: this.dimensions(input.dimensions),
        });
        const { assertForecastVersionSequence } = await import("@naai-erp/domain");
        assertForecastVersionSequence(forecast, existing as ForecastVersion[]);
        await q.query(
          `insert into forecast_versions(organization_id,id,version_number,previous_version_id,scenario,custom_scenario_name,snapshot_kind,as_of_date,starts_on,ends_on,actual_basis,currency,team_id,service_line_code,owner_id,reason,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [
            c.organizationId,
            id,
            forecast.versionNumber,
            forecast.previousVersionId ?? null,
            forecast.scenario,
            forecast.customScenarioName ?? null,
            forecast.snapshotKind,
            forecast.asOfDate,
            forecast.startsOn,
            forecast.endsOn,
            forecast.actualBasis,
            forecast.currency,
            forecast.dimensions.teamId ?? null,
            forecast.dimensions.serviceLineCode ?? null,
            forecast.dimensions.ownerId ?? null,
            input.reason,
            c.actorId,
          ],
        );
      }
      const auditEventId = await this.audit(
        q,
        c,
        resource,
        id,
        "create",
        "1",
        String(input.reason),
      );
      return {
        resource: await this.getWith(q, c.organizationId, resource, id),
        mutation: this.meta(c, "1", auditEventId, false),
      };
    });
  }

  transition(
    c: PlanningContext,
    resource: PlanningResource,
    id: string,
    action: string,
    input: Record<string, unknown>,
    key: string,
  ) {
    return this.mutate(c, key, `${resource}:${action}`, { id, input }, async (q) => {
      const table = TABLE[resource],
        raw = (
          await q.query(`select * from ${table} where organization_id=$1 and id=$2 for update`, [
            c.organizationId,
            id,
          ])
        ).rows[0];
      if (!raw) throw new Error("RESOURCE_NOT_FOUND");
      if (String(raw.version) !== String(input.expectedResourceVersion))
        throw new Error("VERSION_CONFLICT");
      const current = this.domain(resource, raw),
        existing = (await this.existing(q, c.organizationId, resource)).filter(
          (version) => version.id !== id,
        );
      if (action === "publish" && raw.created_by === c.actorId)
        throw new Error("MAKER_CHECKER_VIOLATION");
      if (resource === "revenue-targets") {
        if (action === "publish")
          publishRevenueTargetVersion(
            current as RevenueTargetVersion,
            existing as RevenueTargetVersion[],
            c.actorId,
            new Date().toISOString(),
          );
        else supersedeRevenueTargetVersion(current as RevenueTargetVersion);
      } else {
        if (action === "publish")
          publishForecastVersion(
            current as ForecastVersion,
            existing as ForecastVersion[],
            c.actorId,
            new Date().toISOString(),
          );
        else supersedeForecastVersion(current as ForecastVersion);
      }
      const nextState = action === "publish" ? "published" : "superseded",
        version = (BigInt(raw.version) + 1n).toString();
      await q.query(
        `update ${table} set state=$3::planning_version_state,version=$4,published_by=case when $3::planning_version_state='published'::planning_version_state then $5 else published_by end,published_at=case when $3::planning_version_state='published'::planning_version_state then now() else published_at end,updated_at=now() where organization_id=$1 and id=$2`,
        [c.organizationId, id, nextState, version, c.actorId],
      );
      if (action === "publish" && raw.previous_version_id)
        await q.query(
          `update ${table} set state='superseded',version=version+1,updated_at=now() where organization_id=$1 and id=$2 and state='published'`,
          [c.organizationId, raw.previous_version_id],
        );
      const auditEventId = await this.audit(
        q,
        c,
        resource,
        id,
        action,
        version,
        String(input.reason),
      );
      return {
        resource: await this.getWith(q, c.organizationId, resource, id),
        mutation: this.meta(c, version, auditEventId, false),
      };
    });
  }

  private select(resource: PlanningResource) {
    const common = `id,version_number "versionNumber",previous_version_id "previousVersionId",starts_on::text "startsOn",ends_on::text "endsOn",actual_basis "actualBasis",currency,team_id "teamId",service_line_code "serviceLineCode",owner_id "ownerId",state,version::text "resourceVersion",published_by "publishedBy",published_at::text "publishedAt",created_by "createdBy"`;
    return resource === "revenue-targets"
      ? `select ${common},period_kind "periodKind",amount_minor::text "amountMinor" from revenue_target_versions`
      : `select ${common},scenario,custom_scenario_name "customScenarioName",snapshot_kind "snapshotKind",as_of_date::text "asOfDate" from forecast_versions`;
  }
  private async getWith(
    q: Pick<PoolClient, "query"> | pg.Pool,
    org: string,
    resource: PlanningResource,
    id: string,
  ) {
    const row = (
      await q.query(`${this.select(resource)} where organization_id=$1 and id=$2`, [org, id])
    ).rows[0];
    return row ? this.contract(resource, row) : undefined;
  }
  private contract(resource: PlanningResource, row: any) {
    return {
      schemaVersion: 1,
      ...row,
      dimensions: {
        ...(row.teamId ? { teamId: row.teamId } : {}),
        ...(row.serviceLineCode ? { serviceLineCode: row.serviceLineCode } : {}),
        ...(row.ownerId ? { ownerId: row.ownerId } : {}),
      },
      nextActions:
        row.state === "draft"
          ? ["publish"]
          : row.state === "published" &&
              (resource === "revenue-targets" || row.snapshotKind !== "month_end")
            ? ["supersede"]
            : [],
    };
  }
  private domain(resource: PlanningResource, row: any): RevenueTargetVersion | ForecastVersion {
    const base = {
      organizationId: row.organization_id,
      id: row.id,
      versionNumber: row.version_number,
      ...(row.previous_version_id ? { previousVersionId: row.previous_version_id } : {}),
      startsOn: this.dateText(row.starts_on),
      endsOn: this.dateText(row.ends_on),
      actualBasis: row.actual_basis,
      currency: row.currency,
      dimensions: {
        ...(row.team_id ? { teamId: row.team_id } : {}),
        ...(row.service_line_code ? { serviceLineCode: row.service_line_code } : {}),
        ...(row.owner_id ? { ownerId: row.owner_id } : {}),
      },
      state: row.state,
      version: Number(row.version),
      ...(row.published_by ? { publishedBy: row.published_by } : {}),
      ...(row.published_at ? { publishedAt: new Date(row.published_at).toISOString() } : {}),
    };
    return resource === "revenue-targets"
      ? ({
          ...base,
          periodKind: row.period_kind,
          amountMinor: BigInt(row.amount_minor),
        } as RevenueTargetVersion)
      : ({
          ...base,
          scenario: row.scenario,
          ...(row.custom_scenario_name ? { customScenarioName: row.custom_scenario_name } : {}),
          snapshotKind: row.snapshot_kind,
          asOfDate: this.dateText(row.as_of_date),
        } as ForecastVersion);
  }
  private async existing(q: PoolClient, org: string, resource: PlanningResource) {
    return (
      await q.query(`select * from ${TABLE[resource]} where organization_id=$1`, [org])
    ).rows.map((r) => this.domain(resource, r));
  }
  private dimensions(value: unknown) {
    const x = (value ?? {}) as Record<string, unknown>;
    return {
      ...(x.teamId ? { teamId: String(x.teamId) } : {}),
      ...(x.serviceLineCode ? { serviceLineCode: String(x.serviceLineCode) } : {}),
      ...(x.ownerId ? { ownerId: String(x.ownerId) } : {}),
    };
  }
  private dateText(value: unknown) {
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  }
  private meta(
    c: PlanningContext,
    resourceVersion: string,
    auditEventId: string,
    replayed: boolean,
  ) {
    return {
      resourceVersion,
      auditEventId,
      correlationId: c.correlationId,
      idempotencyReplayed: replayed,
      nextActions: [],
    };
  }
  private async audit(
    q: PoolClient,
    c: PlanningContext,
    resource: string,
    id: string,
    action: string,
    version: string,
    reason: string,
  ) {
    const eventId = randomUUID();
    await q.query(
      `insert into planning_audit_events(organization_id,id,resource_type,resource_id,action,actor_id,reason,correlation_id,resource_version) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        c.organizationId,
        eventId,
        resource,
        id,
        action,
        c.actorId,
        reason,
        c.correlationId,
        version,
      ],
    );
    return eventId;
  }
  private async mutate(
    c: PlanningContext,
    key: string,
    operation: string,
    input: unknown,
    work: (q: PoolClient) => Promise<any>,
  ) {
    const q = await this.pool.connect(),
      requestHash = hash(input);
    try {
      await q.query("begin");
      await q.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${c.organizationId}:planning:${key}`,
      ]);
      const old = (
        await q.query(
          `select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2`,
          [c.organizationId, key],
        )
      ).rows[0];
      if (old) {
        if (old.request_hash !== requestHash) throw new Error("IDEMPOTENCY_KEY_REUSED");
        await q.query("commit");
        const response = old.response_body;
        response.mutation = { ...response.mutation, idempotencyReplayed: true };
        return response;
      }
      const response = await work(q);
      await q.query(
        `insert into api_idempotency_records(organization_id,idempotency_key,operation,request_hash,response_body) values($1,$2,$3,$4,$5)`,
        [c.organizationId, key, operation, requestHash, JSON.stringify(response)],
      );
      await q.query("commit");
      return response;
    } catch (error) {
      await q.query("rollback");
      throw error;
    } finally {
      q.release();
    }
  }
}
