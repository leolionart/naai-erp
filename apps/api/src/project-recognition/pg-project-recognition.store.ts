import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg, { type PoolClient } from "pg";
import type {
  ProjectRecognitionContext,
  RecognitionResource,
} from "./project-recognition.types.js";
import {
  type AcceptanceCapRow,
  type AcceptanceRow,
  type BudgetApprovalRow,
  CAMEL_SQL,
  type PolicyApprovalRow,
  type RecognitionRow,
  TABLE,
} from "./pg-project-recognition.store.shared.js";
import {
  transitionOperation,
  revenuePositionOperation,
  createBudgetOperation,
  createPolicyOperation,
  createRecognitionOperation,
  postRecognitionOperation,
} from "./project-recognition-transition.operation.js";
import {
  reverseRecognitionOperation,
  mutateOperation,
} from "./project-recognition-reverse-recognition.operation.js";

@Injectable()
export class PgProjectRecognitionStore {
  readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  async list(
    c: ProjectRecognitionContext,
    resource: RecognitionResource,
    projectId?: string,
    state?: string,
  ) {
    const alias =
      resource === "milestone-acceptances"
        ? "c"
        : resource === "revenue-recognition-events"
          ? "e"
          : TABLE[resource];
    const values: unknown[] = [c.organizationId];
    let filters = "";
    if (projectId) {
      values.push(projectId);
      filters += ` and ${alias}.project_id=$${values.length}`;
    }
    if (state) {
      values.push(state);
      filters += ` and ${resource === "milestone-acceptances" ? "a" : alias}.state=$${values.length}`;
    }
    const sql = `${CAMEL_SQL[resource]} where ${alias}.organization_id=$1${filters} order by ${resource === "milestone-acceptances" ? "a" : alias}.created_at desc,${resource === "milestone-acceptances" ? "a" : alias}.id`;
    return { items: (await this.pool.query(sql, values)).rows };
  }
  async get(c: ProjectRecognitionContext, resource: RecognitionResource, id: string) {
    const alias =
      resource === "milestone-acceptances"
        ? "a"
        : resource === "revenue-recognition-events"
          ? "e"
          : TABLE[resource];
    const row = (
      await this.pool.query(
        `${CAMEL_SQL[resource]} where ${alias}.organization_id=$1 and ${alias}.id=$2`,
        [c.organizationId, id],
      )
    ).rows[0];
    if (!row || resource !== "project-budgets") return row;
    const lines = (
      await this.pool.query(
        `select id,category,amount_minor::text "amountMinor",service_line_code "serviceLineCode",milestone_id "milestoneId",note from project_budget_lines where organization_id=$1 and budget_version_id=$2 order by id`,
        [c.organizationId, id],
      )
    ).rows;
    return { ...row, lines };
  }
  create(
    c: ProjectRecognitionContext,
    resource: RecognitionResource,
    input: Record<string, unknown>,
    key: string,
  ) {
    return this.mutate(c, key, `${resource}:create`, input, async (q) => {
      const id = String(input.id ?? randomUUID());
      if (resource === "scope-changes") await this.createScope(q, c, id, input);
      else if (resource === "project-budgets") await this.createBudget(q, c, id, input);
      else if (resource === "recognition-policies") await this.createPolicy(q, c, id, input);
      else if (resource === "milestone-acceptances") await this.createAcceptance(q, c, id, input);
      else await this.createRecognition(q, c, id, input);
      await this.audit(q, c, resource, id, "create", "1", input.reason);
      return {
        resource: await this.getWith(q, c.organizationId, resource, id),
        mutation: this.meta(c, "1"),
      };
    });
  }
  transition = transitionOperation;
  revenuePosition = revenuePositionOperation;
  async createScope(
    q: PoolClient,
    c: ProjectRecognitionContext,
    id: string,
    i: Record<string, unknown>,
  ) {
    this.money(i.expectedRevenueImpactMinor, true);
    this.money(i.expectedCostImpactMinor, true);
    if (!Number.isInteger(i.expectedScheduleImpactDays)) throw new Error("VALIDATION_FAILED");
    await this.project(q, c.organizationId, i.projectId);
    await this.evidence(q, c.organizationId, i.evidenceIds, false);
    await q.query(
      `insert into scope_changes(organization_id,id,project_id,reason,expected_revenue_impact_minor,expected_cost_impact_minor,expected_schedule_impact_days,evidence_ids,created_by)values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        c.organizationId,
        id,
        i.projectId,
        i.reason,
        i.expectedRevenueImpactMinor,
        i.expectedCostImpactMinor,
        i.expectedScheduleImpactDays,
        JSON.stringify(i.evidenceIds ?? []),
        c.actorId,
      ],
    );
  }
  createBudget = createBudgetOperation;
  createPolicy = createPolicyOperation;
  async createAcceptance(
    q: PoolClient,
    c: ProjectRecognitionContext,
    id: string,
    i: Record<string, unknown>,
  ) {
    this.money(i.acceptedAmountMinor);
    if (!this.date(i.effectiveOn)) throw new Error("VALIDATION_FAILED");
    const m = await q.query(`select 1 from milestones where organization_id=$1 and id=$2`, [
      c.organizationId,
      i.milestoneId,
    ]);
    if (!m.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    await this.evidence(q, c.organizationId, i.evidenceIds, true);
    await q.query(
      `insert into milestone_acceptances(organization_id,id,milestone_id,accepted_amount_minor,effective_on,evidence_ids,reason,created_by)values($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        c.organizationId,
        id,
        i.milestoneId,
        i.acceptedAmountMinor,
        i.effectiveOn,
        JSON.stringify(i.evidenceIds ?? []),
        i.reason,
        c.actorId,
      ],
    );
  }
  createRecognition = createRecognitionOperation;
  target(resource: RecognitionResource, action: string, state: string) {
    const map: Record<string, Record<string, [string, string]>> = {
      "scope-changes": {
        submit: ["draft", "submitted"],
        approve: ["submitted", "approved"],
        reject: ["submitted", "rejected"],
      },
      "project-budgets": {
        submit: ["draft", "submitted"],
        approve: ["submitted", "approved"],
        reject: ["submitted", "rejected"],
      },
      "recognition-policies": {
        submit: ["draft", "submitted"],
        approve: ["submitted", "approved"],
        reject: ["submitted", "rejected"],
      },
      "milestone-acceptances": {
        submit: ["draft", "submitted"],
        accept: ["submitted", "accepted"],
        reject: ["submitted", "rejected"],
      },
      "revenue-recognition-events": {
        submit: ["draft", "submitted"],
        approve: ["submitted", "approved"],
        reject: ["submitted", "rejected"],
        post: ["approved", "posted"],
        reverse: ["posted", "reversed"],
      },
    };
    const x = map[resource]?.[action];
    if (!x || x[0] !== state) throw new Error("INVALID_STATE_TRANSITION");
    return x[1];
  }
  async validateBudgetApproval(q: PoolClient, org: string, id: string) {
    const b = await q.query<BudgetApprovalRow>(
      `select * from project_budget_versions where organization_id=$1 and id=$2`,
      [org, id],
    );
    const x = b.rows[0];
    if (!x) throw new Error("RESOURCE_NOT_FOUND");
    await q.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${org}:budget:${x.project_id}`,
    ]);
    if (x.kind === "baseline") {
      const old = await q.query(
        `select 1 from project_budget_versions where organization_id=$1 and project_id=$2 and id<>$3 and kind='baseline' and state in('approved','superseded')`,
        [org, x.project_id, id],
      );
      if (old.rows[0]) throw new Error("BUDGET_BASELINE_EXISTS");
    } else {
      const max = await q.query<{ n: number }>(
        `select coalesce(max(version_number),0)::int n from project_budget_versions where organization_id=$1 and project_id=$2 and id<>$3`,
        [org, x.project_id, id],
      );
      if (x.version_number !== (max.rows[0]?.n ?? 0) + 1)
        throw new Error("BUDGET_VERSION_NOT_SEQUENTIAL");
    }
  }
  async validatePolicyApproval(q: PoolClient, org: string, id: string) {
    const p = await q.query<PolicyApprovalRow>(
      `select * from revenue_recognition_policies where organization_id=$1 and id=$2`,
      [org, id],
    );
    const x = p.rows[0];
    if (!x) throw new Error("RESOURCE_NOT_FOUND");
    await q.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${org}:recognition-policy:${x.project_id}`,
    ]);
    const overlap = await q.query(
      `select 1 from revenue_recognition_policies where organization_id=$1 and project_id=$2 and id<>$3 and state='approved' and daterange(effective_from,coalesce(effective_to,'infinity'::date),'[]')&&daterange($4::date,coalesce($5::date,'infinity'::date),'[]')`,
      [org, x.project_id, id, x.effective_from, x.effective_to],
    );
    if (overlap.rows[0]) throw new Error("RECOGNITION_POLICY_EFFECTIVE_OVERLAP");
  }
  async validateAcceptance(q: PoolClient, org: string, id: string) {
    const a = await q.query<AcceptanceRow>(
      `select a.*,m.amount_minor from milestone_acceptances a join milestones m on m.organization_id=a.organization_id and m.id=a.milestone_id where a.organization_id=$1 and a.id=$2`,
      [org, id],
    );
    const x = a.rows[0];
    if (!x) throw new Error("RESOURCE_NOT_FOUND");
    await q.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${org}:milestone-acceptance:${x.milestone_id}`,
    ]);
    const sum = await q.query<{ n: string }>(
      `select coalesce(sum(accepted_amount_minor),0)::text n from milestone_acceptances where organization_id=$1 and milestone_id=$2 and id<>$3 and state='accepted'`,
      [org, x.milestone_id, id],
    );
    if (BigInt(sum.rows[0]?.n ?? 0) + BigInt(x.accepted_amount_minor) > BigInt(x.amount_minor))
      throw new Error("MILESTONE_ACCEPTANCE_CAP_EXCEEDED");
  }
  async validateRecognition(q: PoolClient, org: string, id: string) {
    const e = await q.query<RecognitionRow>(
      `select e.*,p.contract_value_minor,p.method,p.evidence_required from revenue_recognition_events e join revenue_recognition_policies p on p.organization_id=e.organization_id and p.id=e.policy_id where e.organization_id=$1 and e.id=$2`,
      [org, id],
    );
    const x = e.rows[0];
    if (!x) throw new Error("RESOURCE_NOT_FOUND");
    await q.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${org}:recognition-cap:${x.project_id}`,
    ]);
    if (x.evidence_required && (!x.evidence_ids || x.evidence_ids.length === 0))
      throw new Error("RECOGNITION_EVIDENCE_REQUIRED");
    const total = await q.query<{ n: string }>(
      `select coalesce(sum(amount_minor),0)::text n from revenue_recognition_events where organization_id=$1 and project_id=$2 and id<>$3 and state in('approved','posted')`,
      [org, x.project_id, id],
    );
    if (BigInt(total.rows[0]?.n ?? 0) + BigInt(x.amount_minor) > BigInt(x.contract_value_minor))
      throw new Error("RECOGNITION_CONTRACT_CAP_EXCEEDED");
    if (x.milestone_acceptance_id) {
      const a = await q.query<AcceptanceCapRow>(
        `select accepted_amount_minor,state from milestone_acceptances where organization_id=$1 and id=$2`,
        [org, x.milestone_acceptance_id],
      );
      if (a.rows[0]?.state !== "accepted") throw new Error("RECOGNITION_ACCEPTANCE_NOT_ACCEPTED");
      const used = await q.query<{ n: string }>(
        `select coalesce(sum(amount_minor),0)::text n from revenue_recognition_events where organization_id=$1 and milestone_acceptance_id=$2 and id<>$3 and state in('approved','posted')`,
        [org, x.milestone_acceptance_id, id],
      );
      if (
        BigInt(used.rows[0]?.n ?? 0) + BigInt(x.amount_minor) >
        BigInt(a.rows[0].accepted_amount_minor)
      )
        throw new Error("RECOGNITION_ACCEPTANCE_CAP_EXCEEDED");
    }
  }
  postRecognition = postRecognitionOperation;
  reverseRecognition = reverseRecognitionOperation;
  async project(q: PoolClient, org: string, id: unknown) {
    const r = await q.query(`select 1 from projects where organization_id=$1 and id=$2`, [org, id]);
    if (!r.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
  }
  async account(q: PoolClient, org: string, code: unknown, root: string) {
    const r = await q.query(
      `select 1 from accounts where organization_id=$1 and code=$2 and root_type=$3`,
      [org, code, root],
    );
    if (!r.rows[0]) throw new Error("RECOGNITION_ACCOUNT_INVALID");
  }
  async evidence(q: PoolClient, org: string, ids: unknown, required: boolean) {
    if (!Array.isArray(ids)) {
      if (required) throw new Error("EVIDENCE_REQUIRED");
      return;
    }
    if (required && !ids.length) throw new Error("EVIDENCE_REQUIRED");
    for (const id of ids) {
      const r = await q.query(`select 1 from evidence_records where organization_id=$1 and id=$2`, [
        org,
        id,
      ]);
      if (!r.rows[0]) throw new Error("EVIDENCE_NOT_FOUND");
    }
  }
  async openPeriod(q: PoolClient, org: string, date: unknown) {
    const r = await q.query(
      `select 1 from fiscal_periods where organization_id=$1 and $2::date between starts_on and ends_on and state='open'`,
      [org, date],
    );
    if (!r.rows[0]) throw new Error("RECOGNITION_PERIOD_CLOSED");
  }
  money(x: unknown, signed = false) {
    if (!(signed ? /^-?\d+$/ : /^\d+$/).test(String(x))) throw new Error("VALIDATION_FAILED");
    const n = BigInt(String(x));
    if (!signed && n <= 0n) throw new Error("VALIDATION_FAILED");
    return n;
  }
  date(x: unknown) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(x));
  }
  currency(x: unknown) {
    return /^[A-Z]{3}$/.test(String(x).toUpperCase());
  }
  async getWith(q: PoolClient, org: string, resource: RecognitionResource, id: string) {
    const alias =
      resource === "milestone-acceptances"
        ? "a"
        : resource === "revenue-recognition-events"
          ? "e"
          : TABLE[resource];
    const row = (
      await q.query(`${CAMEL_SQL[resource]} where ${alias}.organization_id=$1 and ${alias}.id=$2`, [
        org,
        id,
      ])
    ).rows[0];
    if (resource !== "project-budgets") return row;
    const lines = (
      await q.query(
        `select id,category,amount_minor::text "amountMinor",service_line_code "serviceLineCode",milestone_id "milestoneId",note from project_budget_lines where organization_id=$1 and budget_version_id=$2 order by id`,
        [org, id],
      )
    ).rows;
    return { ...row, lines };
  }
  audit(
    q: PoolClient,
    c: ProjectRecognitionContext,
    r: RecognitionResource,
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
  meta(c: ProjectRecognitionContext, v: string) {
    return { resourceVersion: v, correlationId: c.correlationId, idempotencyReplayed: false };
  }
  mutate = mutateOperation;
}
