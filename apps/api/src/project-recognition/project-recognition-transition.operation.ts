import { randomUUID } from "node:crypto";
import { type PoolClient } from "pg";
import {
  canSelfApprove,
  resolveOrganizationWorkflowPolicy,
} from "../workflow-policy/organization-workflow-policy.service.js";
import type {
  ProjectRecognitionContext,
  RecognitionResource,
} from "./project-recognition.types.js";
import {
  type PolicyRow,
  type RecognitionRow,
  TABLE,
} from "./pg-project-recognition.store.shared.js";
import type { PgProjectRecognitionStore } from "./pg-project-recognition.store.js";

export function transitionOperation(
  this: PgProjectRecognitionStore,
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
    if (["approve", "accept"].includes(action) && current.submitted_by === c.actorId) {
      const policy = await resolveOrganizationWorkflowPolicy(c.organizationId, q);
      if (!canSelfApprove({ policy, roles: c.roles })) throw new Error("MAKER_CHECKER_VIOLATION");
    }
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

export async function revenuePositionOperation(
  this: PgProjectRecognitionStore,
  c: ProjectRecognitionContext,
  projectId: string,
  asOf = "9999-12-31",
) {
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
    `select coalesce(sum(case when d.type='sales_invoice' then a.amount_minor when d.type='credit_note' then -a.amount_minor else 0 end),0)::text n
     from commercial_document_allocations a
     join commercial_documents d on d.organization_id=a.organization_id and d.id=a.document_id
     where a.organization_id=$1 and a.dimensions->>'projectId'=$2 and d.document_date<=$3
       and d.state in('issued','posted','partially_paid','paid')`,
    [c.organizationId, projectId, asOf],
  );
  const collected = await this.pool.query<{ n: string }>(
    `select coalesce(sum(a.target_amount_minor * x.project_net_minor / nullif(d.net_minor,0)),0)::text n
     from reconciliation_allocations a
     join reconciliation_attempts r on r.organization_id=a.organization_id and r.id=a.reconciliation_id
     join commercial_documents d on d.organization_id=a.organization_id and d.id=a.commercial_document_id
     join lateral (select sum(a2.amount_minor) project_net_minor from commercial_document_allocations a2 where a2.organization_id=d.organization_id and a2.document_id=d.id and a2.dimensions->>'projectId'=$2) x on x.project_net_minor is not null
     where a.organization_id=$1 and d.type='sales_invoice' and r.state='reconciled'
       and r.reconciled_at::date<=$3::date`,
    [c.organizationId, projectId, asOf],
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

export async function createBudgetOperation(
  this: PgProjectRecognitionStore,
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

export async function createPolicyOperation(
  this: PgProjectRecognitionStore,
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

export async function createRecognitionOperation(
  this: PgProjectRecognitionStore,
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

export async function postRecognitionOperation(
  this: PgProjectRecognitionStore,
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
