import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg, { type PoolClient } from "pg";
import type { MutationInput, WorkforceContext } from "./workforce.types.js";
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
@Injectable()
export class PgWorkforceStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  async listWorkers(org: string) {
    const r = await this.pool.query(
      `select id,party_id "workerPartyId",user_id "userId",kind "employmentKind",starts_on::text "startsOn",ends_on::text "endsOn",case when active then 'active' else 'inactive' end status,version::text "resourceVersion" from workforce_profiles where organization_id=$1 order by id`,
      [org],
    );
    return { items: r.rows };
  }
  async createWorker(c: WorkforceContext, i: Record<string, unknown>, key: string) {
    return this.mutate(c, key, "workforce:create", i, async (q) => {
      const id = String(i.id ?? randomUUID());
      await q.query(
        `insert into workforce_profiles(organization_id,id,party_id,user_id,kind,starts_on,ends_on,created_by,updated_by)values($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
        [
          c.organizationId,
          id,
          i.workerPartyId,
          i.userId ?? null,
          i.employmentKind,
          i.startsOn,
          i.endsOn ?? null,
          c.actorId,
        ],
      );
      return {
        resource: (
          await q.query(
            `select id,party_id "workerPartyId",user_id "userId",kind "employmentKind",starts_on::text "startsOn",ends_on::text "endsOn",case when active then 'active' else 'inactive' end status,version::text "resourceVersion" from workforce_profiles where organization_id=$1 and id=$2`,
            [c.organizationId, id],
          )
        ).rows[0],
        mutation: this.meta(c, "1"),
      };
    });
  }
  async listTimesheets(org: string, query: Record<string, string | undefined>) {
    const p: unknown[] = [org];
    let w = "organization_id=$1";
    if (query.workerId) {
      p.push(query.workerId);
      w += ` and worker_id=$${p.length}`;
    }
    if (query.state) {
      p.push(query.state);
      w += ` and state=$${p.length}`;
    }
    const r = await this.pool.query(
      `select id,worker_id "workerId",week_starts_on::text "weekStartsOn",state,version::text "resourceVersion" from timesheets where ${w} order by week_starts_on desc,id`,
      p,
    );
    return { items: r.rows };
  }
  async getTimesheet(org: string, id: string) {
    const s = await this.pool.query(
      `select id,worker_id "workerId",week_starts_on::text "weekStartsOn",state,version::text "resourceVersion" from timesheets where organization_id=$1 and id=$2`,
      [org, id],
    );
    if (!s.rows[0]) return undefined;
    return this.view(this.pool, org, id);
  }
  async createTimesheet(c: WorkforceContext, i: Record<string, unknown>, key: string) {
    return this.mutate(c, key, "timesheet:create", i, async (q) => {
      const id = String(i.id ?? randomUUID());
      await q.query(
        `insert into timesheets(organization_id,id,worker_id,week_starts_on,created_by)values($1,$2,$3,$4,$5)`,
        [c.organizationId, id, i.workerId, i.weekStartsOn, c.actorId],
      );
      for (const raw of i.entries as Record<string, unknown>[]) {
        await q.query(
          `insert into timesheet_entries(organization_id,id,timesheet_id,work_date,mode,scope,project_id,contract_id,service_line_code,cost_center_code,activity_code,minutes,billable,description,started_at,ended_at,allocation_percent,created_by)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
          [
            c.organizationId,
            String(raw.id ?? randomUUID()),
            id,
            raw.workDate,
            raw.mode,
            raw.workClassification,
            raw.projectId ?? null,
            raw.contractId ?? null,
            raw.serviceLineCode ?? null,
            raw.costCenterCode ?? null,
            raw.activityCode ?? null,
            raw.minutes,
            raw.billingClassification === "billable",
            raw.description,
            raw.startedAt ?? null,
            raw.endedAt ?? null,
            raw.allocationPercent ?? null,
            c.actorId,
          ],
        );
      }
      return { resource: await this.view(q, c.organizationId, id), mutation: this.meta(c, "1") };
    });
  }
  async transitionTimesheet(
    c: WorkforceContext,
    id: string,
    action: string,
    i: MutationInput,
    key: string,
  ) {
    return this.mutate(c, key, `timesheet:${action}`, { id, i }, async (q) => {
      const r = await q.query<{ state: string; version: string }>(
        `select state,version::text from timesheets where organization_id=$1 and id=$2 for update`,
        [c.organizationId, id],
      );
      if (!r.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      if (r.rows[0].version !== i.expectedResourceVersion) throw new Error("VERSION_CONFLICT");
      const allowed: Record<string, string[]> = {
        submit: ["draft"],
        approve: ["submitted"],
        lock: ["approved"],
        "mark-billed": ["locked"],
        reject: ["submitted"],
        revise: ["rejected"],
      };
      if (!allowed[action]?.includes(r.rows[0].state)) throw new Error("INVALID_STATE_TRANSITION");
      if (action === "approve") await this.applySnapshots(q, c, id);
      const state =
          action === "submit"
            ? "submitted"
            : action === "approve"
              ? "approved"
              : action === "lock"
                ? "locked"
                : action === "mark-billed"
                  ? "billed"
                  : action === "revise"
                    ? "draft"
                    : "rejected",
        v = (BigInt(r.rows[0].version) + 1n).toString(),
        field =
          action === "submit"
            ? "submitted"
            : action === "approve"
              ? "approved"
              : action === "lock"
                ? "locked"
                : action === "mark-billed"
                  ? "billed"
                  : action === "revise"
                    ? "revised"
                    : "rejected";
      await q.query(
        `update timesheets set state=$3,version=$4,${field}_by=$5,${field}_at=now(),rejection_reason=case when $3='rejected' then $6 else rejection_reason end,billing_reference=case when $3='billed' then $7 else billing_reference end,updated_at=now() where organization_id=$1 and id=$2`,
        [
          c.organizationId,
          id,
          state,
          v,
          c.actorId,
          i.reason,
          "billingReference" in i ? i.billingReference : null,
        ],
      );
      return { resource: await this.view(q, c.organizationId, id), mutation: this.meta(c, v) };
    });
  }
  async createAdjustment(c: WorkforceContext, id: string, i: Record<string, unknown>, key: string) {
    return this.mutate(c, key, "timesheet:adjustment:create", { id, i }, async (q) => {
      const s = await q.query<{ state: string; version: string }>(
        `select state,version::text from timesheets where organization_id=$1 and id=$2 for update`,
        [c.organizationId, id],
      );
      const timesheet = s.rows[0];
      if (!timesheet || !["approved", "locked", "billed"].includes(timesheet.state))
        throw new Error("TIMESHEET_NOT_APPROVED");
      if (timesheet.version !== i.expectedResourceVersion) throw new Error("VERSION_CONFLICT");
      const original = await q.query<{ hourly: string; currency: string }>(
        `select x.applied_hourly_rate_minor::text hourly,x.currency from timesheet_entries e join timesheet_cost_snapshots x on x.organization_id=e.organization_id and x.entry_id=e.id where e.organization_id=$1 and e.timesheet_id=$2 and e.id=$3 and e.work_date=$4`,
        [c.organizationId, id, i.originalEntryId, i.workDate],
      );
      if (!original.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      const aid = String(i.id ?? randomUUID());
      const costDelta =
        (BigInt(original.rows[0].hourly) * BigInt(Number(i.minutesDelta)) +
          (Number(i.minutesDelta) >= 0 ? 30n : -30n)) /
        60n;
      await q.query(
        `insert into timesheet_adjustments(organization_id,id,timesheet_id,entry_id,work_date,minute_delta,cost_delta_minor,currency,reason,requested_by)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          c.organizationId,
          aid,
          id,
          i.originalEntryId,
          i.workDate,
          i.minutesDelta,
          costDelta.toString(),
          original.rows[0].currency,
          i.reason,
          c.actorId,
        ],
      );
      return { resource: await this.view(q, c.organizationId, id), mutation: this.meta(c, "1") };
    });
  }
  async reviewAdjustment(
    c: WorkforceContext,
    id: string,
    aid: string,
    action: string,
    i: MutationInput,
    key: string,
  ) {
    return this.mutate(c, key, `timesheet:adjustment:${action}`, { id, aid, i }, async (q) => {
      const r = await q.query<{ state: string; version: string }>(
        `select state,version::text from timesheet_adjustments where organization_id=$1 and timesheet_id=$2 and id=$3 for update`,
        [c.organizationId, id, aid],
      );
      if (!r.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      const allowed: Record<string, string[]> = {
        submit: ["draft"],
        approve: ["submitted"],
        reject: ["submitted"],
      };
      if (!allowed[action]?.includes(r.rows[0].state)) throw new Error("INVALID_STATE_TRANSITION");
      if (r.rows[0].version !== i.expectedResourceVersion) throw new Error("VERSION_CONFLICT");
      const v = (BigInt(r.rows[0].version) + 1n).toString(),
        field = action === "submit" ? "submitted" : action === "approve" ? "approved" : "rejected";
      await q.query(
        action === "submit"
          ? `update timesheet_adjustments set state='submitted',version=$5,submitted_by=$6,submitted_at=now(),updated_at=now() where organization_id=$1 and timesheet_id=$2 and id=$3`
          : `update timesheet_adjustments set state=$4,version=$5,${field}_by=$6,${field}_at=now(),${field === "approved" ? "approval_reason" : "rejection_reason"}=$7,updated_at=now() where organization_id=$1 and timesheet_id=$2 and id=$3`,
        [c.organizationId, id, aid, field, v, c.actorId, i.reason],
      );
      return { resource: await this.view(q, c.organizationId, id), mutation: this.meta(c, v) };
    });
  }
  async listRates(org: string, workerId?: string) {
    const r = await this.pool.query(
      `select id,worker_id "workerId",basis,hourly_rate_minor::text "rateMinorPerHour",currency,effective_from::text "effectiveFrom",effective_to::text "effectiveTo",state,version::text "resourceVersion" from labor_cost_rates where organization_id=$1 and ($2::text is null or worker_id=$2) order by worker_id,effective_from desc`,
      [org, workerId ?? null],
    );
    return { items: r.rows };
  }
  async createRate(c: WorkforceContext, i: Record<string, unknown>, key: string) {
    return this.mutate(c, key, "labor-rate:create", i, async (q) => {
      const id = String(i.id ?? randomUUID());
      await q.query(
        `insert into labor_cost_rates(organization_id,id,worker_id,basis,hourly_rate_minor,currency,effective_from,effective_to,created_by)values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          c.organizationId,
          id,
          i.workerId,
          i.basis,
          i.rateMinorPerHour,
          i.currency,
          i.effectiveFrom,
          i.effectiveTo ?? null,
          c.actorId,
        ],
      );
      return {
        resource: (
          await q.query(
            `select id,worker_id "workerId",basis,currency,hourly_rate_minor::text "rateMinorPerHour",effective_from::text "effectiveFrom",effective_to::text "effectiveTo",state,version::text "resourceVersion" from labor_cost_rates where organization_id=$1 and id=$2`,
            [c.organizationId, id],
          )
        ).rows[0],
        mutation: this.meta(c, "1"),
      };
    });
  }
  async reviewRate(c: WorkforceContext, id: string, action: string, i: MutationInput, key: string) {
    return this.mutate(c, key, `labor-rate:${action}`, { id, i }, async (q) => {
      const r = await q.query<{ state: string; version: string }>(
        `select state,version::text from labor_cost_rates where organization_id=$1 and id=$2 for update`,
        [c.organizationId, id],
      );
      if (!r.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      if (r.rows[0].version !== i.expectedResourceVersion) throw new Error("VERSION_CONFLICT");
      if (
        (action === "approve" && r.rows[0].state !== "draft") ||
        (action === "retire" && r.rows[0].state !== "approved")
      )
        throw new Error("INVALID_STATE_TRANSITION");
      if (action === "approve") {
        const overlap = await q.query(
          `select 1 from labor_cost_rates candidate join labor_cost_rates existing on existing.organization_id=candidate.organization_id and existing.worker_id=candidate.worker_id and existing.id<>candidate.id and existing.state='approved' and daterange(existing.effective_from,coalesce(existing.effective_to,'infinity'::date),'[]') && daterange(candidate.effective_from,coalesce(candidate.effective_to,'infinity'::date),'[]') where candidate.organization_id=$1 and candidate.id=$2`,
          [c.organizationId, id],
        );
        if (overlap.rows[0]) throw new Error("LABOR_COST_RATE_OVERLAP");
      }
      const state = action === "approve" ? "approved" : "retired",
        v = (BigInt(r.rows[0].version) + 1n).toString();
      await q.query(
        `update labor_cost_rates set state=$3,version=$4,approved_by=case when $3='approved' then $5 else approved_by end,approved_at=case when $3='approved' then now() else approved_at end,approval_reason=case when $3='approved' then $6 else approval_reason end,updated_at=now() where organization_id=$1 and id=$2`,
        [c.organizationId, id, state, v, c.actorId, i.reason],
      );
      return { resource: { id, state, resourceVersion: v }, mutation: this.meta(c, v) };
    });
  }
  async listCapacity(org: string, workerId?: string) {
    const r = await this.pool.query(
      `select id,worker_id "workerId",weekly_minutes "weeklyCapacityMinutes",workdays,effective_from::text "effectiveFrom",effective_to::text "effectiveTo",version::text "resourceVersion",reason from workforce_capacity_versions where organization_id=$1 and ($2::text is null or worker_id=$2) order by worker_id,effective_from desc`,
      [org, workerId ?? null],
    );
    return { items: r.rows };
  }
  async createCapacity(c: WorkforceContext, i: Record<string, unknown>, key: string) {
    return this.mutate(c, key, "capacity:create", i, async (q) => {
      const id = String(i.id ?? randomUUID());
      await q.query(
        `insert into workforce_capacity_versions(organization_id,id,worker_id,weekly_minutes,workdays,effective_from,effective_to,reason,created_by)values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          c.organizationId,
          id,
          i.workerId,
          i.weeklyCapacityMinutes,
          JSON.stringify(i.workdays),
          i.effectiveFrom,
          i.effectiveTo ?? null,
          i.reason,
          c.actorId,
        ],
      );
      return { resource: { id, resourceVersion: "1" }, mutation: this.meta(c, "1") };
    });
  }
  async capacitySummary(org: string, qy: Record<string, string | undefined>) {
    const r = await this.pool.query(
      `select w.id "workerId",
        coalesce((select sum(c.weekly_minutes) from workforce_capacity_versions c where c.organization_id=w.organization_id and c.worker_id=w.id and c.effective_from<=$3 and coalesce(c.effective_to,$3)>=$2),0)::int "availableMinutes",
        coalesce((select sum(e.minutes) from timesheets t join timesheet_entries e on e.organization_id=t.organization_id and e.timesheet_id=t.id where t.organization_id=w.organization_id and t.worker_id=w.id and t.state in('approved','locked','billed') and t.week_starts_on between $2 and $3),0)::int + coalesce((select sum(a.minute_delta) from timesheets t join timesheet_adjustments a on a.organization_id=t.organization_id and a.timesheet_id=t.id where t.organization_id=w.organization_id and t.worker_id=w.id and a.state='approved' and t.week_starts_on between $2 and $3),0)::int "approvedMinutes",
        coalesce((select sum(e.minutes) from timesheets t join timesheet_entries e on e.organization_id=t.organization_id and e.timesheet_id=t.id where t.organization_id=w.organization_id and t.worker_id=w.id and t.state in('approved','locked','billed') and e.billable and t.week_starts_on between $2 and $3),0)::int "billableMinutes",
        coalesce((select sum(e.minutes) from timesheets t join timesheet_entries e on e.organization_id=t.organization_id and e.timesheet_id=t.id where t.organization_id=w.organization_id and t.worker_id=w.id and t.state in('approved','locked','billed') and not e.billable and t.week_starts_on between $2 and $3),0)::int "nonBillableMinutes"
       from workforce_profiles w where w.organization_id=$1 order by w.id`,
      [org, qy.from, qy.to],
    );
    return {
      from: qy.from,
      to: qy.to,
      items: r.rows.map((x) => ({
        ...x,
        unallocatedMinutes: Math.max(0, Number(x.availableMinutes) - Number(x.approvedMinutes)),
      })),
    };
  }
  private async applySnapshots(q: PoolClient, c: WorkforceContext, id: string) {
    const entries = await q.query<{
      id: string;
      work_date: string;
      minutes: number;
      worker_id: string;
    }>(
      `select e.id,e.work_date::text,e.minutes,t.worker_id from timesheet_entries e join timesheets t on t.organization_id=e.organization_id and t.id=e.timesheet_id where e.organization_id=$1 and e.timesheet_id=$2`,
      [c.organizationId, id],
    );
    for (const e of entries.rows) {
      const rate = await q.query<{ id: string; hourly_rate_minor: string; currency: string }>(
        `select id,hourly_rate_minor::text,currency from labor_cost_rates where organization_id=$1 and worker_id=$2 and state='approved' and effective_from<=$3 and(effective_to is null or effective_to>=$3) order by effective_from desc limit 1`,
        [c.organizationId, e.worker_id, e.work_date],
      );
      if (!rate.rows[0]) throw new Error("LABOR_COST_RATE_MISSING");
      const cost = (BigInt(rate.rows[0].hourly_rate_minor) * BigInt(e.minutes) + 30n) / 60n;
      await q.query(
        `insert into timesheet_cost_snapshots(organization_id,entry_id,rate_id,applied_hourly_rate_minor,applied_cost_minor,currency,applied_by)values($1,$2,$3,$4,$5,$6,$7)`,
        [
          c.organizationId,
          e.id,
          rate.rows[0].id,
          rate.rows[0].hourly_rate_minor,
          cost.toString(),
          rate.rows[0].currency,
          c.actorId,
        ],
      );
    }
  }
  private async view(q: Pick<PoolClient, "query">, org: string, id: string) {
    const s = await q.query(
      `select id,worker_id "workerId",week_starts_on::text "weekStartsOn",state,submitted_by "submittedBy",approved_by "approvedBy",rejected_by "rejectedBy",locked_by "lockedBy",billing_reference "billingReference",version::text "resourceVersion" from timesheets where organization_id=$1 and id=$2`,
      [org, id],
    );
    const e = await q.query(
      `select e.id,e.work_date::text "workDate",e.mode,e.started_at "startsAt",e.ended_at "endsAt",e.minutes,e.scope "workClassification",case when e.billable then 'billable' else 'non_billable' end "billingClassification",e.project_id "projectId",e.contract_id "contractId",e.service_line_code "serviceLineCode",e.cost_center_code "costCenterCode",e.activity_code "activityCode",e.description,case when x.entry_id is null then null else jsonb_build_object('rateVersionId',x.rate_id,'currency',x.currency,'calculationVersion',1,'roundingPolicy','half_up','costMinor',x.applied_cost_minor::text) end "appliedCost" from timesheet_entries e left join timesheet_cost_snapshots x on x.organization_id=e.organization_id and x.entry_id=e.id where e.organization_id=$1 and e.timesheet_id=$2 order by e.work_date,e.id`,
      [org, id],
    );
    const a = await q.query(
      `select id,entry_id "originalEntryId",work_date::text "workDate",minute_delta "minutesDelta",reason,state,requested_by "createdBy",approved_by "approvedBy",case when state='approved' then jsonb_build_object('rateVersionId',coalesce((select rate_id from timesheet_cost_snapshots where organization_id=$1 and entry_id=timesheet_adjustments.entry_id),''),'currency',currency,'calculationVersion',1,'roundingPolicy','half_up','costMinor',cost_delta_minor::text) end "appliedCost" from timesheet_adjustments where organization_id=$1 and timesheet_id=$2 order by created_at,id`,
      [org, id],
    );
    const state = String(s.rows[0]?.state);
    const nextActions =
      state === "draft"
        ? ["submit"]
        : state === "submitted"
          ? ["approve", "reject"]
          : state === "approved"
            ? ["lock", "create-adjustment"]
            : state === "rejected"
              ? ["revise"]
              : state === "locked"
                ? ["mark-billed", "create-adjustment"]
                : ["create-adjustment"];
    return { ...s.rows[0], entries: e.rows, adjustments: a.rows, nextActions };
  }
  private meta(c: WorkforceContext, v: string) {
    return { resourceVersion: v, correlationId: c.correlationId, idempotencyReplayed: false };
  }
  private async mutate(
    c: WorkforceContext,
    key: string,
    op: string,
    req: unknown,
    fn: (q: PoolClient) => Promise<Record<string, unknown>>,
  ) {
    const q = await this.pool.connect(),
      h = hash(req);
    try {
      await q.query("begin");
      await q.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${c.organizationId}:${key}`,
      ]);
      const old = await q.query<{ request_hash: string; response_body: Record<string, unknown> }>(
        `select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2 for update`,
        [c.organizationId, key],
      );
      if (old.rows[0]) {
        if (old.rows[0].request_hash !== h) throw new Error("IDEMPOTENCY_CONFLICT");
        await q.query("rollback");
        return { ...old.rows[0].response_body, idempotencyReplayed: true };
      }
      const out = await fn(q);
      await q.query(
        `insert into api_idempotency_records(organization_id,idempotency_key,operation,request_hash,response_body)values($1,$2,$3,$4,$5)`,
        [c.organizationId, key, op, h, out],
      );
      await q.query("commit");
      return out;
    } catch (e) {
      await q.query("rollback");
      throw e;
    } finally {
      q.release();
    }
  }
}
