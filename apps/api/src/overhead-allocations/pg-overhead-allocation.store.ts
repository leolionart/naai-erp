/* eslint-disable @typescript-eslint/no-explicit-any -- Dynamic PostgreSQL row shapes are validated before use. */
import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg, { type PoolClient } from "pg";
import type { OverheadContext, OverheadResource } from "./overhead-allocation.types.js";
const hash = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
const TABLE: Record<OverheadResource, string> = {
  "overhead-allocation-policies": "overhead_allocation_policies",
  "overhead-source-pools": "overhead_source_pools",
  "overhead-allocation-runs": "overhead_allocation_runs",
};
const SELECT: Record<OverheadResource, string> = {
  "overhead-allocation-policies": `select id,policy_code "policyCode",version_number "versionNumber",name,method,cost_class "costClass",effective_from::text "effectiveFrom",effective_to::text "effectiveTo",configuration,state,version::text "resourceVersion",submitted_by "submittedBy",approved_by "approvedBy",rejected_by "rejectedBy" from overhead_allocation_policies`,
  "overhead-source-pools": `select id,policy_id "policyId",policy_version_number "policyVersionNumber",period_start::text "periodStart",period_end::text "periodEnd",currency,source_amount_minor::text "sourceAmountMinor",source_base_amount_minor::text "sourceBaseAmountMinor",state,version::text "resourceVersion",reason from overhead_source_pools`,
  "overhead-allocation-runs": `select id,pool_id "poolId",policy_id "policyId",policy_version_number "policyVersionNumber",method,period_start::text "periodStart",period_end::text "periodEnd",currency,allocatable_amount_minor::text "allocatableAmountMinor",basis_snapshot "basisSnapshot",policy_snapshot "policySnapshot",state,version::text "resourceVersion",submitted_by "submittedBy",approved_by "approvedBy",rejected_by "rejectedBy",posted_by "postedBy",reversed_by "reversedBy",reason from overhead_allocation_runs`,
};
type Basis = { projectId: string; basis: bigint };
type Split = Basis & { amount: bigint; rank: number };
export function allocateOverheadDeterministically(total: bigint, basis: Basis[]): Split[] {
  const denominator = basis.reduce((n, x) => n + x.basis, 0n);
  if (total <= 0n || denominator <= 0n) throw new Error("OVERHEAD_BASIS_EMPTY");
  const raw = basis.map((x) => ({
      ...x,
      amount: (total * x.basis) / denominator,
      remainder: (total * x.basis) % denominator,
    })),
    left = Number(total - raw.reduce((n, x) => n + x.amount, 0n)),
    ranked = [...raw].sort((a, b) =>
      a.remainder === b.remainder
        ? a.projectId.localeCompare(b.projectId)
        : a.remainder > b.remainder
          ? -1
          : 1,
    );
  for (let n = 0; n < left; n++) ranked[n]!.amount += 1n;
  const rank = new Map(ranked.map((x, n) => [x.projectId, n + 1]));
  return raw
    .map((x) => ({
      projectId: x.projectId,
      basis: x.basis,
      amount: x.amount,
      rank: rank.get(x.projectId)!,
    }))
    .sort((a, b) => a.projectId.localeCompare(b.projectId));
}
@Injectable()
export class PgOverheadAllocationStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  async list(c: OverheadContext, r: OverheadResource, f: Record<string, string | undefined>) {
    const t = TABLE[r],
      v: unknown[] = [c.organizationId];
    let where = "";
    for (const [k, col] of [
      ["state", "state"],
      ["periodStart", "period_start"],
      ["periodEnd", "period_end"],
    ] as const)
      if (f[k] && (k === "state" || r !== "overhead-allocation-policies")) {
        v.push(f[k]);
        where += ` and ${t}.${col}=$${v.length}`;
      }
    return {
      items: (
        await this.pool.query(
          `${SELECT[r]} where ${t}.organization_id=$1${where} order by ${t}.created_at desc,${t}.id`,
          v,
        )
      ).rows,
    };
  }
  async get(c: OverheadContext, r: OverheadResource, id: string) {
    return this.getPool(this.pool, c.organizationId, r, id);
  }
  create(c: OverheadContext, r: OverheadResource, i: Record<string, unknown>, key: string) {
    return this.mutate(c, key, `${r}:create`, i, async (q) => {
      const id = String(i.id ?? randomUUID());
      if (r === "overhead-allocation-policies") await this.createPolicy(q, c, id, i);
      else if (r === "overhead-source-pools") await this.createSourcePool(q, c, id, i);
      else await this.createRun(q, c, id, i);
      await this.audit(q, c, r, id, "create", "1", i.reason);
      return {
        resource: await this.getPool(q, c.organizationId, r, id),
        mutation: this.meta(c, "1"),
      };
    });
  }
  transition(
    c: OverheadContext,
    r: OverheadResource,
    id: string,
    a: string,
    i: Record<string, unknown>,
    key: string,
  ) {
    return this.mutate(c, key, `${r}:${a}`, { id, i }, async (q) => {
      const t = TABLE[r],
        row = await q.query<any>(
          `select * from ${t} where organization_id=$1 and id=$2 for update`,
          [c.organizationId, id],
        ),
        x = row.rows[0];
      if (!x) throw new Error("RESOURCE_NOT_FOUND");
      if (String(x.version) !== i.expectedResourceVersion) throw new Error("VERSION_CONFLICT");
      const target = this.target(r, a, x.state);
      if (["approve"].includes(a) && x.submitted_by === c.actorId)
        throw new Error("MAKER_CHECKER_VIOLATION");
      if (r === "overhead-allocation-policies" && a === "approve")
        await this.approvePolicy(q, c.organizationId, x);
      if (r === "overhead-allocation-runs" && ["approve", "post", "reverse"].includes(a))
        await this.assertOpenPeriod(q, c.organizationId, x.period_start, x.period_end);
      if (r === "overhead-allocation-runs" && a === "approve")
        await this.validateRun(q, c.organizationId, id, x.allocatable_amount_minor);
      const v = (BigInt(x.version) + 1n).toString(),
        field = target === "reversed" ? "reversed" : target === "posted" ? "posted" : target;
      await q.query(
        `update ${t} set state=$3,version=$4,${field}_by=$5,${field}_at=now(),updated_at=now() where organization_id=$1 and id=$2`,
        [c.organizationId, id, target, v, c.actorId],
      );
      if (r === "overhead-allocation-policies" && a === "approve")
        await q.query(
          `update overhead_allocation_policies set state='superseded',version=version+1,updated_at=now() where organization_id=$1 and policy_code=$2 and id<>$3 and state='approved'`,
          [c.organizationId, x.policy_code, id],
        );
      if (r === "overhead-allocation-runs" && a === "post")
        await q.query(
          `update overhead_source_pools set state='allocated',version=version+1,updated_at=now() where organization_id=$1 and id=$2 and state='ready'`,
          [c.organizationId, x.pool_id],
        );
      if (r === "overhead-allocation-runs" && a === "reverse")
        await q.query(
          `update overhead_source_pools set state='reversed',version=version+1,updated_at=now() where organization_id=$1 and id=$2 and state='allocated'`,
          [c.organizationId, x.pool_id],
        );
      await this.audit(q, c, r, id, a, v, i.reason);
      return {
        resource: await this.getPool(q, c.organizationId, r, id),
        mutation: this.meta(c, v),
      };
    });
  }
  private async createPolicy(
    q: PoolClient,
    c: OverheadContext,
    id: string,
    i: Record<string, unknown>,
  ) {
    if (
      !String(i.policyCode ?? "").trim() ||
      !String(i.name ?? "").trim() ||
      !/^\d+$/.test(String(i.versionNumber)) ||
      !["revenue", "labor_hours", "headcount", "fixed_percentage", "manual"].includes(
        String(i.method),
      ) ||
      !["variable", "fixed"].includes(String(i.costClass)) ||
      !this.date(i.effectiveFrom)
    )
      throw new Error("VALIDATION_FAILED");
    const config = (i.configuration ?? {}) as Record<string, unknown>;
    if (i.method === "fixed_percentage")
      await this.weights(q, c.organizationId, config.projectWeights);
    await q.query(
      `insert into overhead_allocation_policies(organization_id,id,policy_code,version_number,name,method,cost_class,effective_from,effective_to,configuration,created_by)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        c.organizationId,
        id,
        i.policyCode,
        i.versionNumber,
        i.name,
        i.method,
        i.costClass,
        i.effectiveFrom,
        i.effectiveTo ?? null,
        JSON.stringify(config),
        c.actorId,
      ],
    );
  }
  private async createSourcePool(
    q: PoolClient,
    c: OverheadContext,
    id: string,
    i: Record<string, unknown>,
  ) {
    if (
      !Array.isArray(i.sourceCostItemIds) ||
      !i.sourceCostItemIds.length ||
      !this.date(i.periodStart) ||
      !this.date(i.periodEnd)
    )
      throw new Error("VALIDATION_FAILED");
    await this.assertOpenPeriod(q, c.organizationId, i.periodStart, i.periodEnd);
    const p = await q.query<any>(
      `select * from overhead_allocation_policies where organization_id=$1 and id=$2 and state='approved' and $3::date>=effective_from and(effective_to is null or $4::date<=effective_to)`,
      [c.organizationId, i.policyId, i.periodStart, i.periodEnd],
    );
    if (!p.rows[0]) throw new Error("OVERHEAD_POLICY_NOT_EFFECTIVE");
    let amount = 0n,
      base = 0n,
      currency: string | undefined;
    const seen = new Set<string>();
    for (const raw of i.sourceCostItemIds) {
      const sid = String(raw);
      if (seen.has(sid)) throw new Error("VALIDATION_FAILED");
      seen.add(sid);
      const s = await q.query<any>(
        `select * from project_cost_items where organization_id=$1 and id=$2 and cost_class='overhead_reserved' and project_id is null and effective_on between $3 and $4 for update`,
        [c.organizationId, sid, i.periodStart, i.periodEnd],
      );
      const x = s.rows[0];
      if (!x) throw new Error("OVERHEAD_SOURCE_INVALID");
      const claim = await q.query(
        `select 1 from overhead_source_pool_items where organization_id=$1 and source_cost_item_id=$2`,
        [c.organizationId, sid],
      );
      if (claim.rows[0]) throw new Error("OVERHEAD_SOURCE_ALREADY_CLAIMED");
      if (currency && currency !== x.currency) throw new Error("OVERHEAD_SOURCE_CURRENCY_MISMATCH");
      currency = x.currency;
      amount += BigInt(x.amount_minor);
      base += BigInt(x.base_amount_minor);
    }
    await q.query(
      `insert into overhead_source_pools(organization_id,id,policy_id,policy_version_number,period_start,period_end,currency,source_amount_minor,source_base_amount_minor,reason,created_by)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        c.organizationId,
        id,
        i.policyId,
        p.rows[0].version_number,
        i.periodStart,
        i.periodEnd,
        currency,
        amount,
        base,
        i.reason,
        c.actorId,
      ],
    );
    for (const sid of seen) {
      const s = await q.query<any>(
        `select amount_minor,base_amount_minor from project_cost_items where organization_id=$1 and id=$2`,
        [c.organizationId, sid],
      );
      await q.query(
        `insert into overhead_source_pool_items(organization_id,pool_id,source_cost_item_id,amount_minor,base_amount_minor)values($1,$2,$3,$4,$5)`,
        [c.organizationId, id, sid, s.rows[0].amount_minor, s.rows[0].base_amount_minor],
      );
    }
  }
  private async createRun(
    q: PoolClient,
    c: OverheadContext,
    id: string,
    i: Record<string, unknown>,
  ) {
    const pool = await q.query<any>(
      `select p.*,v.method,v.cost_class,v.configuration from overhead_source_pools p join overhead_allocation_policies v on v.organization_id=p.organization_id and v.id=p.policy_id where p.organization_id=$1 and p.id=$2 and p.state='ready' for update of p`,
      [c.organizationId, i.poolId],
    );
    const x = pool.rows[0];
    if (!x) throw new Error("OVERHEAD_POOL_NOT_READY");
    await this.assertOpenPeriod(q, c.organizationId, x.period_start, x.period_end);
    await q.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${c.organizationId}:overhead-run:${x.pool_id}`,
    ]);
    let basis: Basis[];
    if (x.method === "manual")
      basis = await this.manualBasis(
        q,
        c.organizationId,
        i.allocations,
        x.source_base_amount_minor,
      );
    else if (x.method === "fixed_percentage")
      basis = await this.weights(q, c.organizationId, x.configuration.projectWeights);
    else
      basis = await this.derivedBasis(q, c.organizationId, x.method, x.period_start, x.period_end);
    if (!basis.length || basis.reduce((n, b) => n + b.basis, 0n) <= 0n)
      throw new Error("OVERHEAD_BASIS_EMPTY");
    const splits = allocateOverheadDeterministically(BigInt(x.source_base_amount_minor), basis);
    await q.query(
      `insert into overhead_allocation_runs(organization_id,id,pool_id,policy_id,policy_version_number,method,period_start,period_end,currency,allocatable_amount_minor,basis_snapshot,policy_snapshot,reason,created_by)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        c.organizationId,
        id,
        x.id,
        x.policy_id,
        x.policy_version_number,
        x.method,
        x.period_start,
        x.period_end,
        x.currency,
        x.source_base_amount_minor,
        JSON.stringify(
          basis.map((b) => ({ projectId: b.projectId, basisValue: b.basis.toString() })),
        ),
        JSON.stringify({
          method: x.method,
          costClass: x.cost_class,
          configuration: x.configuration,
          policyVersionNumber: x.policy_version_number,
        }),
        i.reason,
        c.actorId,
      ],
    );
    const total = basis.reduce((n, b) => n + b.basis, 0n);
    for (const s of splits)
      await q.query(
        `insert into overhead_allocation_splits(organization_id,run_id,project_id,basis_value,basis_total,amount_minor,rounding_rank)values($1,$2,$3,$4,$5,$6,$7)`,
        [c.organizationId, id, s.projectId, s.basis, total, s.amount, s.rank],
      );
  }
  private async derivedBasis(
    q: PoolClient,
    org: string,
    method: string,
    start: string,
    end: string,
  ): Promise<Basis[]> {
    let sql: string;
    if (method === "revenue")
      sql = `select project_id "projectId",sum(amount_minor)::text basis from revenue_recognition_events where organization_id=$1 and state='posted' and effective_on between $2 and $3 group by project_id`;
    else if (method === "labor_hours")
      sql = `select e.project_id "projectId",sum(e.minutes)::text basis from timesheet_entries e join timesheets t on t.organization_id=e.organization_id and t.id=e.timesheet_id where e.organization_id=$1 and e.entry_scope='project' and t.state in('approved','locked','billed') and e.work_date between $2 and $3 group by e.project_id`;
    else
      sql = `select e.project_id "projectId",count(distinct t.worker_id)::text basis from timesheet_entries e join timesheets t on t.organization_id=e.organization_id and t.id=e.timesheet_id where e.organization_id=$1 and e.entry_scope='project' and t.state in('approved','locked','billed') and e.work_date between $2 and $3 group by e.project_id`;
    return (await q.query<any>(sql, [org, start, end])).rows
      .filter((x: any) => x.projectId && BigInt(x.basis) > 0n)
      .map((x: any) => ({ projectId: x.projectId, basis: BigInt(x.basis) }));
  }
  private async weights(q: PoolClient, org: string, input: unknown): Promise<Basis[]> {
    if (!Array.isArray(input) || !input.length) throw new Error("OVERHEAD_WEIGHTS_REQUIRED");
    const out: Basis[] = [];
    for (const x of input as Record<string, unknown>[]) {
      if (
        !String(x.projectId ?? "") ||
        !/^\d+$/.test(String(x.weight)) ||
        BigInt(String(x.weight)) <= 0n
      )
        throw new Error("VALIDATION_FAILED");
      await this.project(q, org, String(x.projectId));
      out.push({ projectId: String(x.projectId), basis: BigInt(String(x.weight)) });
    }
    if (new Set(out.map((x) => x.projectId)).size !== out.length)
      throw new Error("VALIDATION_FAILED");
    return out;
  }
  private async manualBasis(
    q: PoolClient,
    org: string,
    input: unknown,
    total: unknown,
  ): Promise<Basis[]> {
    if (!Array.isArray(input) || !input.length)
      throw new Error("OVERHEAD_MANUAL_ALLOCATIONS_REQUIRED");
    const out: Basis[] = [];
    for (const x of input as Record<string, unknown>[]) {
      if (!/^\d+$/.test(String(x.amountMinor)) || BigInt(String(x.amountMinor)) <= 0n)
        throw new Error("VALIDATION_FAILED");
      await this.project(q, org, String(x.projectId));
      out.push({ projectId: String(x.projectId), basis: BigInt(String(x.amountMinor)) });
    }
    if (
      new Set(out.map((x) => x.projectId)).size !== out.length ||
      out.reduce((n, x) => n + x.basis, 0n) !== BigInt(String(total))
    )
      throw new Error("OVERHEAD_MANUAL_TOTAL_MISMATCH");
    return out;
  }
  private target(r: OverheadResource, a: string, state: string) {
    const m: Record<string, Record<string, [string, string]>> = {
      "overhead-allocation-policies": {
        submit: ["draft", "submitted"],
        approve: ["submitted", "approved"],
        reject: ["submitted", "rejected"],
      },
      "overhead-allocation-runs": {
        submit: ["draft", "submitted"],
        approve: ["submitted", "approved"],
        reject: ["submitted", "rejected"],
        post: ["approved", "posted"],
        reverse: ["posted", "reversed"],
      },
    };
    const x = m[r]?.[a];
    if (!x || x[0] !== state) throw new Error("INVALID_STATE_TRANSITION");
    return x[1];
  }
  private async approvePolicy(q: PoolClient, org: string, x: any) {
    await q.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${org}:overhead-policy:${x.policy_code}`,
    ]);
    const maximum = await q.query<{ n: number }>(
      `select coalesce(max(version_number),0)::int n from overhead_allocation_policies where organization_id=$1 and policy_code=$2 and id<>$3 and state in('approved','superseded')`,
      [org, x.policy_code, x.id],
    );
    if (x.version_number !== (maximum.rows[0]?.n ?? 0) + 1)
      throw new Error("OVERHEAD_POLICY_VERSION_NOT_SEQUENTIAL");
    const locked = await q.query(
      `select 1 from fiscal_periods where organization_id=$1 and $2::date between starts_on and ends_on and state<>'open'`,
      [org, x.effective_from],
    );
    if (locked.rows[0]) throw new Error("OVERHEAD_POLICY_PERIOD_LOCKED");
    const overlap = await q.query(
      `select 1 from overhead_allocation_policies where organization_id=$1 and policy_code=$2 and id<>$3 and state='approved' and daterange(effective_from,coalesce(effective_to,'infinity'::date),'[]')&&daterange($4::date,coalesce($5::date,'infinity'::date),'[]')`,
      [org, x.policy_code, x.id, x.effective_from, x.effective_to],
    );
    if (overlap.rows[0]) throw new Error("OVERHEAD_POLICY_EFFECTIVE_OVERLAP");
  }
  private async validateRun(q: PoolClient, org: string, id: string, total: unknown) {
    await q.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${org}:overhead-run-approval:${id}`,
    ]);
    const sum = await q.query<{ n: string }>(
      `select coalesce(sum(amount_minor),0)::text n from overhead_allocation_splits where organization_id=$1 and run_id=$2`,
      [org, id],
    );
    if (BigInt(sum.rows[0]?.n ?? 0) !== BigInt(String(total)))
      throw new Error("OVERHEAD_SPLIT_TOTAL_MISMATCH");
  }
  private async assertOpenPeriod(q: PoolClient, org: string, start: unknown, end: unknown) {
    const p = await q.query(
      `select 1 from fiscal_periods where organization_id=$1 and starts_on=$2 and ends_on=$3 and state='open'`,
      [org, start, end],
    );
    if (!p.rows[0]) throw new Error("OVERHEAD_PERIOD_LOCKED");
  }
  private async project(q: PoolClient, org: string, id: string) {
    const p = await q.query(
      `select 1 from projects where organization_id=$1 and id=$2 and state in('planned','active','on_hold','completed')`,
      [org, id],
    );
    if (!p.rows[0]) throw new Error("OVERHEAD_PROJECT_INVALID");
  }
  private date(x: unknown) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(x));
  }
  private async getPool(
    q: Pick<PoolClient, "query"> | pg.Pool,
    org: string,
    r: OverheadResource,
    id: string,
  ) {
    const t = TABLE[r],
      row = (await q.query(`${SELECT[r]} where ${t}.organization_id=$1 and ${t}.id=$2`, [org, id]))
        .rows[0];
    if (!row) return;
    if (r === "overhead-source-pools") {
      const items = (
        await q.query(
          `select source_cost_item_id "sourceCostItemId",amount_minor::text "amountMinor",base_amount_minor::text "baseAmountMinor" from overhead_source_pool_items where organization_id=$1 and pool_id=$2 order by source_cost_item_id`,
          [org, id],
        )
      ).rows;
      return { ...row, items };
    }
    if (r === "overhead-allocation-runs") {
      const splits = (
        await q.query(
          `select project_id "projectId",basis_value::text "basisValue",basis_total::text "basisTotal",amount_minor::text "amountMinor",rounding_rank "roundingRank" from overhead_allocation_splits where organization_id=$1 and run_id=$2 order by project_id`,
          [org, id],
        )
      ).rows;
      return { ...row, splits };
    }
    return row;
  }
  private audit(
    q: PoolClient,
    c: OverheadContext,
    r: OverheadResource,
    id: string,
    a: string,
    v: string,
    reason: unknown,
  ) {
    return q.query(
      `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state)values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [c.organizationId, randomUUID(), r, id, v, a, c.actorId, c.correlationId, { reason }],
    );
  }
  private meta(c: OverheadContext, v: string) {
    return { resourceVersion: v, correlationId: c.correlationId, idempotencyReplayed: false };
  }
  private async mutate(
    c: OverheadContext,
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
      const old = await q.query<any>(
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
