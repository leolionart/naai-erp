import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg, { type PoolClient } from "pg";
import type {
  ProjectRecognitionContext,
  RecognitionResource,
} from "./project-recognition.types.js";

const digest = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
type PolicyRow = {
  currency: string;
  evidence_required: boolean;
  method: string;
  version_number: number;
  contract_value_minor: string;
  revenue_account_code: string;
  contract_asset_account_code: string;
  contract_liability_account_code: string;
};
type BudgetApprovalRow = { project_id: string; kind: string; version_number: number };
type PolicyApprovalRow = {
  project_id: string;
  effective_from: string;
  effective_to: string | null;
};
type AcceptanceRow = {
  milestone_id: string;
  accepted_amount_minor: string;
  amount_minor: string;
};
type RecognitionRow = {
  project_id: string;
  evidence_required: boolean;
  evidence_ids: readonly string[] | null;
  amount_minor: string;
  contract_value_minor: string;
  milestone_acceptance_id: string | null;
  effective_on: string;
  currency: string;
  journal_id: string | null;
  policy_snapshot: { contractAssetAccountCode: string; revenueAccountCode: string };
};
type AcceptanceCapRow = { accepted_amount_minor: string; state: string };
type IdempotencyRow = { request_hash: string; response_body: Record<string, unknown> };
const TABLE: Record<RecognitionResource, string> = {
  "scope-changes": "scope_changes",
  "project-budgets": "project_budget_versions",
  "recognition-policies": "revenue_recognition_policies",
  "milestone-acceptances": "milestone_acceptances",
  "revenue-recognition-events": "revenue_recognition_events",
};
const CAMEL_SQL: Record<RecognitionResource, string> = {
  "scope-changes": `select id,project_id "projectId",reason,expected_revenue_impact_minor::text "expectedRevenueImpactMinor",expected_cost_impact_minor::text "expectedCostImpactMinor",expected_schedule_impact_days "expectedScheduleImpactDays",evidence_ids "evidenceIds",state,version::text "resourceVersion",submitted_by "submittedBy",approved_by "approvedBy",rejected_by "rejectedBy" from scope_changes`,
  "project-budgets": `select id,project_id "projectId",version_number "versionNumber",kind,previous_version_id "previousVersionId",scope_change_id "scopeChangeId",currency,effective_on::text "effectiveOn",state,revenue_total_minor::text "revenueTotalMinor",direct_cost_total_minor::text "directCostTotalMinor",overhead_total_minor::text "overheadTotalMinor",version::text "resourceVersion",submitted_by "submittedBy",approved_by "approvedBy",rejected_by "rejectedBy" from project_budget_versions`,
  "recognition-policies": `select id,project_id "projectId",version_number "versionNumber",method,effective_from::text "effectiveFrom",effective_to::text "effectiveTo",currency,contract_value_minor::text "contractValueMinor",revenue_account_code "revenueAccountCode",contract_asset_account_code "contractAssetAccountCode",contract_liability_account_code "contractLiabilityAccountCode",evidence_required "evidenceRequired",state,version::text "resourceVersion",submitted_by "submittedBy",approved_by "approvedBy",rejected_by "rejectedBy" from revenue_recognition_policies`,
  "milestone-acceptances": `select a.id,a.milestone_id "milestoneId",c.project_id "projectId",a.accepted_amount_minor::text "acceptedAmountMinor",a.effective_on::text "effectiveOn",a.evidence_ids "evidenceIds",a.state,a.reason,a.version::text "resourceVersion",a.submitted_by "submittedBy",a.accepted_by "acceptedBy",a.rejected_by "rejectedBy" from milestone_acceptances a join milestones m on m.organization_id=a.organization_id and m.id=a.milestone_id join contracts c on c.organization_id=m.organization_id and c.id=m.contract_id`,
  "revenue-recognition-events": `select id,project_id "projectId",policy_id "policyId",policy_version_number "policyVersionNumber",milestone_acceptance_id "milestoneAcceptanceId",effective_on::text "effectiveOn",amount_minor::text "amountMinor",currency,evidence_ids "evidenceIds",policy_snapshot "policySnapshot",state,version::text "resourceVersion",journal_id "journalId",reversal_journal_id "reversalJournalId",submitted_by "submittedBy",approved_by "approvedBy",rejected_by "rejectedBy",posted_by "postedBy",reversed_by "reversedBy",reason from revenue_recognition_events`,
};

@Injectable()
export class PgProjectRecognitionStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
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
          ? "revenue_recognition_events"
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
    const alias = resource === "milestone-acceptances" ? "a" : TABLE[resource];
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
  transition(
    c: ProjectRecognitionContext,
    resource: RecognitionResource,
    id: string,
    action: string,
    input: Record<string, unknown>,
    key: string,
  ) {
    return this.mutate(c, key, `${resource}:${action}`, { id, input }, async (q) => {
      const table = TABLE[resource],
        lock = await q.query<{ state: string; version: string; submitted_by: string | null }>(
          `select state,version::text,submitted_by from ${table} where organization_id=$1 and id=$2 for update`,
          [c.organizationId, id],
        );
      const current = lock.rows[0];
      if (!current) throw new Error("RESOURCE_NOT_FOUND");
      if (current.version !== input.expectedResourceVersion) throw new Error("VERSION_CONFLICT");
      const target = this.target(resource, action, current.state);
      if (["approve", "accept"].includes(action) && current.submitted_by === c.actorId)
        throw new Error("MAKER_CHECKER_VIOLATION");
      if (resource === "project-budgets" && action === "approve")
        await this.validateBudgetApproval(q, c.organizationId, id);
      if (resource === "recognition-policies" && action === "approve")
        await this.validatePolicyApproval(q, c.organizationId, id);
      if (resource === "milestone-acceptances" && action === "accept")
        await this.validateAcceptance(q, c.organizationId, id);
      let journalId: string | undefined;
      if (resource === "revenue-recognition-events" && action === "approve")
        await this.validateRecognition(q, c.organizationId, id);
      if (resource === "revenue-recognition-events" && action === "post")
        journalId = await this.postRecognition(q, c, id, String(input.reason));
      if (resource === "revenue-recognition-events" && action === "reverse")
        journalId = await this.reverseRecognition(q, c, id, String(input.reason));
      const v = (BigInt(current.version) + 1n).toString(),
        actorField =
          target === "accepted"
            ? "accepted"
            : target === "reversed"
              ? "reversed"
              : target === "posted"
                ? "posted"
                : target;
      const transitionValues: unknown[] = [c.organizationId, id, target, v, c.actorId];
      let journalSet = "";
      if (resource === "revenue-recognition-events" && action === "post") {
        transitionValues.push(journalId);
        journalSet = ",journal_id=$6";
      } else if (resource === "revenue-recognition-events" && action === "reverse") {
        transitionValues.push(journalId, input.reason);
        journalSet = ",reversal_journal_id=$6,reversal_reason=$7";
      }
      await q.query(
        `update ${table} set state=$3,version=$4,${actorField}_by=$5,${actorField}_at=now(),updated_at=now()${journalSet} where organization_id=$1 and id=$2`,
        transitionValues,
      );
      if (resource === "project-budgets" && action === "approve")
        await q.query(
          `update project_budget_versions set state='superseded',version=version+1,updated_at=now() where organization_id=$1 and project_id=(select project_id from project_budget_versions where organization_id=$1 and id=$2) and id<>$2 and state='approved'`,
          [c.organizationId, id],
        );
      if (resource === "recognition-policies" && action === "approve")
        await q.query(
          `update revenue_recognition_policies set state='superseded',version=version+1,updated_at=now() where organization_id=$1 and project_id=(select project_id from revenue_recognition_policies where organization_id=$1 and id=$2) and id<>$2 and state='approved'`,
          [c.organizationId, id],
        );
      await this.audit(q, c, resource, id, action, v, input.reason);
      return {
        resource: await this.getWith(q, c.organizationId, resource, id),
        mutation: this.meta(c, v),
      };
    });
  }
  async revenuePosition(c: ProjectRecognitionContext, projectId: string, asOf = "9999-12-31") {
    const project = await this.pool.query(
      `select currency from projects where organization_id=$1 and id=$2`,
      [c.organizationId, projectId],
    );
    if (!project.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    const recognized = await this.pool.query<{ n: string }>(
      `select coalesce(sum(case when state='posted' then amount_minor when state='reversed' then 0 else 0 end),0)::text n from revenue_recognition_events where organization_id=$1 and project_id=$2 and effective_on<=$3`,
      [c.organizationId, projectId, asOf],
    );
    const invoiced = await this.pool.query<{ n: string }>(
      `select coalesce(sum(case when d.type='sales_invoice' then l.net_minor when d.type='credit_note' then -l.net_minor else 0 end),0)::text n from commercial_document_lines l join commercial_documents d on d.organization_id=l.organization_id and d.id=l.document_id where l.organization_id=$1 and l.dimensions->>'projectId'=$2 and d.document_date<=$3 and d.state in('issued','posted','partially_paid','paid')`,
      [c.organizationId, projectId, asOf],
    );
    const collected = await this.pool.query<{ n: string }>(
      `select coalesce(sum(a.target_amount_minor * x.project_net_minor / nullif(d.net_minor,0)),0)::text n
       from reconciliation_allocations a
       join commercial_documents d on d.organization_id=a.organization_id and d.id=a.commercial_document_id
       join lateral (select sum(l.net_minor) project_net_minor from commercial_document_lines l where l.organization_id=d.organization_id and l.document_id=d.id and l.dimensions->>'projectId'=$2) x on x.project_net_minor is not null
       where a.organization_id=$1 and d.type='sales_invoice'`,
      [c.organizationId, projectId],
    );
    return {
      projectId,
      asOf,
      currency: project.rows[0].currency,
      recognizedRevenueMinor: recognized.rows[0]?.n ?? "0",
      invoicedRevenueMinor: invoiced.rows[0]?.n ?? "0",
      collectedCashMinor: collected.rows[0]?.n ?? "0",
      axesAreIndependent: true,
    };
  }
  private async createScope(
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
  private async createBudget(
    q: PoolClient,
    c: ProjectRecognitionContext,
    id: string,
    i: Record<string, unknown>,
  ) {
    await this.project(q, c.organizationId, i.projectId);
    if (
      !Array.isArray(i.lines) ||
      !i.lines.length ||
      !/^\d+$/.test(String(i.versionNumber)) ||
      !this.date(i.effectiveOn) ||
      !this.currency(i.currency)
    )
      throw new Error("VALIDATION_FAILED");
    if (i.kind === "baseline" && (i.previousVersionId || i.scopeChangeId))
      throw new Error("BUDGET_BASELINE_LINK_INVALID");
    if (i.kind === "revision") {
      const link = await q.query(
        `select 1 from project_budget_versions p join scope_changes s on s.organization_id=p.organization_id and s.id=$4 and s.project_id=p.project_id and s.state='approved' where p.organization_id=$1 and p.id=$2 and p.project_id=$3 and p.state='approved'`,
        [c.organizationId, i.previousVersionId, i.projectId, i.scopeChangeId],
      );
      if (!link.rows[0]) throw new Error("BUDGET_REVISION_LINK_INVALID");
    }
    let revenue = 0n,
      direct = 0n,
      overhead = 0n;
    const ids = new Set<string>();
    for (const raw of i.lines as Record<string, unknown>[]) {
      const lid = String(raw.id ?? "");
      if (!lid || ids.has(lid)) throw new Error("VALIDATION_FAILED");
      ids.add(lid);
      const n = this.money(raw.amountMinor);
      if (raw.category === "revenue") revenue += n;
      else if (raw.category === "overhead") overhead += n;
      else direct += n;
    }
    await q.query(
      `insert into project_budget_versions(organization_id,id,project_id,version_number,kind,previous_version_id,scope_change_id,currency,effective_on,revenue_total_minor,direct_cost_total_minor,overhead_total_minor,created_by)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        c.organizationId,
        id,
        i.projectId,
        i.versionNumber,
        i.kind,
        i.previousVersionId ?? null,
        i.scopeChangeId ?? null,
        String(i.currency).toUpperCase(),
        i.effectiveOn,
        revenue,
        direct,
        overhead,
        c.actorId,
      ],
    );
    for (const line of i.lines as Record<string, unknown>[])
      await q.query(
        `insert into project_budget_lines(organization_id,budget_version_id,id,category,amount_minor,service_line_code,milestone_id,note)values($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          c.organizationId,
          id,
          line.id,
          line.category,
          line.amountMinor,
          line.serviceLineCode ?? null,
          line.milestoneId ?? null,
          line.note ?? null,
        ],
      );
  }
  private async createPolicy(
    q: PoolClient,
    c: ProjectRecognitionContext,
    id: string,
    i: Record<string, unknown>,
  ) {
    await this.project(q, c.organizationId, i.projectId);
    if (
      !/^\d+$/.test(String(i.versionNumber)) ||
      !this.date(i.effectiveFrom) ||
      !this.currency(i.currency) ||
      !["milestone", "percentage_of_completion", "invoice"].includes(String(i.method))
    )
      throw new Error("VALIDATION_FAILED");
    this.money(i.contractValueMinor);
    for (const [code, root] of [
      [i.revenueAccountCode, "revenue"],
      [i.contractAssetAccountCode, "asset"],
      [i.contractLiabilityAccountCode, "liability"],
    ])
      await this.account(q, c.organizationId, code, String(root));
    await q.query(
      `insert into revenue_recognition_policies(organization_id,id,project_id,version_number,method,effective_from,effective_to,currency,contract_value_minor,revenue_account_code,contract_asset_account_code,contract_liability_account_code,evidence_required,created_by)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        c.organizationId,
        id,
        i.projectId,
        i.versionNumber,
        i.method,
        i.effectiveFrom,
        i.effectiveTo ?? null,
        String(i.currency).toUpperCase(),
        i.contractValueMinor,
        i.revenueAccountCode,
        i.contractAssetAccountCode,
        i.contractLiabilityAccountCode,
        i.evidenceRequired !== false,
        c.actorId,
      ],
    );
  }
  private async createAcceptance(
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
  private async createRecognition(
    q: PoolClient,
    c: ProjectRecognitionContext,
    id: string,
    i: Record<string, unknown>,
  ) {
    const amount = this.money(i.amountMinor);
    if (!this.date(i.effectiveOn)) throw new Error("VALIDATION_FAILED");
    const p = await q.query<PolicyRow>(
      `select * from revenue_recognition_policies where organization_id=$1 and id=$2 and project_id=$3 and state='approved' and $4::date>=effective_from and(effective_to is null or $4::date<=effective_to)`,
      [c.organizationId, i.policyId, i.projectId, i.effectiveOn],
    );
    if (!p.rows[0]) throw new Error("RECOGNITION_POLICY_NOT_EFFECTIVE");
    if (String(i.currency).toUpperCase() !== p.rows[0].currency)
      throw new Error("RECOGNITION_CURRENCY_MISMATCH");
    await this.evidence(q, c.organizationId, i.evidenceIds, p.rows[0].evidence_required);
    if (p.rows[0].method === "milestone" && !i.milestoneAcceptanceId)
      throw new Error("RECOGNITION_ACCEPTANCE_REQUIRED");
    const snap = {
      method: p.rows[0].method,
      versionNumber: p.rows[0].version_number,
      contractValueMinor: String(p.rows[0].contract_value_minor),
      revenueAccountCode: p.rows[0].revenue_account_code,
      contractAssetAccountCode: p.rows[0].contract_asset_account_code,
      contractLiabilityAccountCode: p.rows[0].contract_liability_account_code,
      evidenceRequired: p.rows[0].evidence_required,
    };
    await q.query(
      `insert into revenue_recognition_events(organization_id,id,project_id,policy_id,policy_version_number,milestone_acceptance_id,effective_on,amount_minor,currency,evidence_ids,policy_snapshot,reason,created_by)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        c.organizationId,
        id,
        i.projectId,
        i.policyId,
        p.rows[0].version_number,
        i.milestoneAcceptanceId ?? null,
        i.effectiveOn,
        amount,
        String(i.currency).toUpperCase(),
        JSON.stringify(i.evidenceIds ?? []),
        JSON.stringify(snap),
        i.reason,
        c.actorId,
      ],
    );
  }
  private target(resource: RecognitionResource, action: string, state: string) {
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
  private async validateBudgetApproval(q: PoolClient, org: string, id: string) {
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
  private async validatePolicyApproval(q: PoolClient, org: string, id: string) {
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
  private async validateAcceptance(q: PoolClient, org: string, id: string) {
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
  private async validateRecognition(q: PoolClient, org: string, id: string) {
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
  private async postRecognition(
    q: PoolClient,
    c: ProjectRecognitionContext,
    id: string,
    reason: string,
  ) {
    const e = await q.query<RecognitionRow>(
      `select * from revenue_recognition_events where organization_id=$1 and id=$2`,
      [c.organizationId, id],
    );
    const x = e.rows[0];
    if (!x) throw new Error("RESOURCE_NOT_FOUND");
    await this.openPeriod(q, c.organizationId, x.effective_on);
    const snap = x.policy_snapshot,
      jid = randomUUID();
    await q.query(
      `insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by)values($1,$2,$3,$4,$5,'posted',2,$6,now(),$6,$7,now(),$6)`,
      [
        c.organizationId,
        jid,
        x.effective_on,
        `Revenue recognition ${id}`,
        x.currency,
        c.actorId,
        reason,
      ],
    );
    await q.query(
      `insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)values($1,$2,1,$3,$4,null,$5,$6),($1,$2,2,$7,null,$4,$5,$6)`,
      [
        c.organizationId,
        jid,
        snap.contractAssetAccountCode,
        x.amount_minor,
        reason,
        { projectId: x.project_id },
        snap.revenueAccountCode,
      ],
    );
    return jid;
  }
  private async reverseRecognition(
    q: PoolClient,
    c: ProjectRecognitionContext,
    id: string,
    reason: string,
  ) {
    const e = await q.query<RecognitionRow>(
      `select * from revenue_recognition_events where organization_id=$1 and id=$2`,
      [c.organizationId, id],
    );
    const x = e.rows[0];
    if (!x) throw new Error("RESOURCE_NOT_FOUND");
    if (!x.journal_id) throw new Error("RECOGNITION_JOURNAL_MISSING");
    await this.openPeriod(q, c.organizationId, x.effective_on);
    const jid = randomUUID();
    await q.query(
      `insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by,reversal_of_id)values($1,$2,$3,$4,$5,'posted',2,$6,now(),$6,$7,now(),$6,$8)`,
      [
        c.organizationId,
        jid,
        x.effective_on,
        `Reverse revenue recognition ${id}`,
        x.currency,
        c.actorId,
        reason,
        x.journal_id,
      ],
    );
    await q.query(
      `insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)select organization_id,$3,line_number,account_code,credit_minor,debit_minor,$4,dimensions from journal_lines where organization_id=$1 and journal_id=$2`,
      [c.organizationId, x.journal_id, jid, reason],
    );
    await q.query(
      `update journal_entries set state='reversed',updated_at=now() where organization_id=$1 and id=$2`,
      [c.organizationId, x.journal_id],
    );
    return jid;
  }
  private async project(q: PoolClient, org: string, id: unknown) {
    const r = await q.query(`select 1 from projects where organization_id=$1 and id=$2`, [org, id]);
    if (!r.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
  }
  private async account(q: PoolClient, org: string, code: unknown, root: string) {
    const r = await q.query(
      `select 1 from accounts where organization_id=$1 and code=$2 and root_type=$3`,
      [org, code, root],
    );
    if (!r.rows[0]) throw new Error("RECOGNITION_ACCOUNT_INVALID");
  }
  private async evidence(q: PoolClient, org: string, ids: unknown, required: boolean) {
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
  private async openPeriod(q: PoolClient, org: string, date: unknown) {
    const r = await q.query(
      `select 1 from fiscal_periods where organization_id=$1 and $2::date between starts_on and ends_on and state='open'`,
      [org, date],
    );
    if (!r.rows[0]) throw new Error("RECOGNITION_PERIOD_CLOSED");
  }
  private money(x: unknown, signed = false) {
    if (!(signed ? /^-?\d+$/ : /^\d+$/).test(String(x))) throw new Error("VALIDATION_FAILED");
    const n = BigInt(String(x));
    if (!signed && n <= 0n) throw new Error("VALIDATION_FAILED");
    return n;
  }
  private date(x: unknown) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(x));
  }
  private currency(x: unknown) {
    return /^[A-Z]{3}$/.test(String(x).toUpperCase());
  }
  private async getWith(q: PoolClient, org: string, resource: RecognitionResource, id: string) {
    const alias = resource === "milestone-acceptances" ? "a" : TABLE[resource];
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
  private audit(
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
  private meta(c: ProjectRecognitionContext, v: string) {
    return { resourceVersion: v, correlationId: c.correlationId, idempotencyReplayed: false };
  }
  private async mutate(
    c: ProjectRecognitionContext,
    key: string,
    operation: string,
    request: unknown,
    fn: (q: PoolClient) => Promise<Record<string, unknown>>,
  ) {
    const q = await this.pool.connect(),
      h = digest(request);
    try {
      await q.query("begin");
      await q.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${c.organizationId}:${key}`,
      ]);
      const old = await q.query<IdempotencyRow>(
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
        [c.organizationId, key, operation, h, out],
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
