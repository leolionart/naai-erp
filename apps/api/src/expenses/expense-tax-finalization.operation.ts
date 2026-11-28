import { createHash, randomUUID } from "node:crypto";
import type { ExpenseContext } from "./expense.types.js";
import type { PgExpenseStore } from "./pg-expense.store.js";

export async function dryRunTaxFinalizationOperation(
  this: PgExpenseStore,
  context: ExpenseContext,
  reason: string,
) {
  const c = await this.pool.connect();
  try {
    await c.query("begin isolation level repeatable read");
    const items = await this.taxFinalizationPlan(c, context.organizationId);
    const planHash = createHash("sha256").update(JSON.stringify({ reason, items })).digest("hex");
    await c.query("rollback");
    return this.taxFinalizationResult(items, planHash, true);
  } finally {
    c.release();
  }
}

export async function commitTaxFinalizationOperation(
  this: PgExpenseStore,
  context: ExpenseContext,
  reason: string,
  planHash: string,
  key: string,
) {
  const hash = createHash("sha256").update(JSON.stringify({ reason, planHash })).digest("hex");
  const c = await this.pool.connect();
  try {
    await c.query("begin");
    const replay = await this.replay(c, context.organizationId, key, hash);
    if (replay) {
      await c.query("rollback");
      return { ...replay, idempotencyReplayed: true };
    }
    const items = await this.taxFinalizationPlan(c, context.organizationId);
    const currentHash = createHash("sha256")
      .update(JSON.stringify({ reason, items }))
      .digest("hex");
    if (currentHash !== planHash) throw new Error("TAX_FINALIZATION_PLAN_MISMATCH");
    await c.query("select set_config('app.tax_finalization','on',true)");
    for (const item of items) {
      const table = item.sourceType === "expense" ? "expense_lines" : "commercial_document_lines";
      const idColumn = item.sourceType === "expense" ? "expense_id" : "document_id";
      await c.query(
        `update ${table} set
           management_state=case when management_state='unreviewed' then $4::management_validity_state else management_state end,
           cit_state=case when cit_state='unreviewed' then $5::eligibility_state else cit_state end,
           cit_eligible_minor=case when cit_state='unreviewed' then $6 else cit_eligible_minor end,
           vat_state=case when vat_state='unreviewed' then $7::eligibility_state else vat_state end,
           vat_eligible_minor=case when vat_state='unreviewed' then $8 else vat_eligible_minor end,
           payment_evidence_missing=false,
           reviewed_by=$9,reviewed_at=now(),review_reason=$10,review_reference='solopreneur_policy'
         where organization_id=$1 and ${idColumn}=$2 and line_number=$3`,
        [
          context.organizationId,
          item.sourceId,
          item.lineNumber,
          item.managementState,
          item.citState,
          item.citEligibleMinor,
          item.vatState,
          item.vatEligibleMinor,
          context.actorId,
          reason,
        ],
      );
    }
    const expenseIds = [
      ...new Set(
        items.filter((item) => item.sourceType === "expense").map((item) => item.sourceId),
      ),
    ];
    for (const id of expenseIds) {
      await c.query(
        `update expenses set payment_evidence_missing=coalesce((select bool_or(payment_evidence_missing) from expense_lines where organization_id=$1 and expense_id=$2),false) where organization_id=$1 and id=$2`,
        [context.organizationId, id],
      );
      await this.refreshSummary(c, context.organizationId, id);
    }
    const documentIds = [
      ...new Set(
        items.filter((item) => item.sourceType === "purchase_invoice").map((item) => item.sourceId),
      ),
    ];
    for (const id of documentIds) {
      await c.query(
        `update commercial_documents set payment_evidence_missing=coalesce((select bool_or(payment_evidence_missing) from commercial_document_lines where organization_id=$1 and document_id=$2),false) where organization_id=$1 and id=$2`,
        [context.organizationId, id],
      );
    }
    const auditId = randomUUID();
    const result = {
      ...this.taxFinalizationResult(items, planHash, false),
      auditEventId: auditId,
      idempotencyReplayed: false,
    };
    await c.query(
      `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state)
       values($1,$2,'tax_finalization',$3,1,'commit',$4,$5,$6)`,
      [
        context.organizationId,
        auditId,
        planHash,
        context.actorId,
        context.correlationId,
        { reason, ...result },
      ],
    );
    await this.save(c, context.organizationId, key, "tax-finalization:commit", hash, result);
    await c.query("commit");
    return result;
  } catch (error) {
    await c.query("rollback");
    throw error;
  } finally {
    c.release();
  }
}
