import { createHash, randomUUID } from "node:crypto";
import type { ExpenseContext } from "./expense.types.js";
import type { PgExpenseStore } from "./pg-expense.store.js";

export async function dryRunFundingInferenceOperation(
  this: PgExpenseStore,
  org: string,
  reason: string,
) {
  const c = await this.pool.connect();
  try {
    await c.query("begin isolation level repeatable read");
    const plan = await this.fundingInferencePlan(c, org);
    const planHash = createHash("sha256").update(JSON.stringify({ reason, plan })).digest("hex");
    await c.query("rollback");
    return { dryRun: true, planHash, ...plan };
  } finally {
    c.release();
  }
}

export async function commitFundingInferenceOperation(
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
    const plan = await this.fundingInferencePlan(c, context.organizationId);
    const currentHash = createHash("sha256").update(JSON.stringify({ reason, plan })).digest("hex");
    if (currentHash !== planHash) throw new Error("FUNDING_INFERENCE_PLAN_MISMATCH");
    for (const item of plan.items as Array<{
      expenseId: string;
      suggestedFundingFinancialAccountId: string;
    }>) {
      await c.query(
        `update expenses set funding_financial_account_id=$3,updated_at=now() where organization_id=$1 and id=$2 and funding_financial_account_id is null`,
        [context.organizationId, item.expenseId, item.suggestedFundingFinancialAccountId],
      );
    }
    const auditId = randomUUID();
    const response = {
      dryRun: false,
      planHash,
      counts: plan.counts,
      updatedExpenseIds: (plan.items as Array<{ expenseId: string }>).map((x) => x.expenseId),
      auditEventId: auditId,
      idempotencyReplayed: false,
    };
    await c.query(
      `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state) values($1,$2,'expense_funding_inference',$3,1,'commit',$4,$5,$6)`,
      [
        context.organizationId,
        auditId,
        "organization",
        context.actorId,
        context.correlationId,
        response,
      ],
    );
    await this.save(c, context.organizationId, key, "expense:funding-inference", hash, response);
    await c.query("commit");
    return response;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
