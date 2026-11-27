import type pg from "pg";
import { type PoolClient } from "pg";
import type { PgReconciliationStore } from "./pg-reconciliation.store.js";

export async function viewOperation(
  this: PgReconciliationStore,
  queryable: Pick<PoolClient, "query"> | pg.Pool,
  org: string,
  id: string,
) {
  const parent = await queryable.query<{
    id: string;
    bank_transaction_id: string;
    direction: "receipt" | "payment";
    statement_amount_minor: string;
    statement_currency: string;
    current_attempt_number: number;
    version: string;
  }>(
    "select id,bank_transaction_id,direction,statement_amount_minor::text,statement_currency,current_attempt_number,version::text from payment_reconciliations where organization_id=$1 and id=$2",
    [org, id],
  );
  const p = parent.rows[0];
  if (!p) throw new Error("RESOURCE_NOT_FOUND");
  const attempts = await queryable.query<{
    id: string;
    attempt_number: number;
    state: "matched" | "reconciled" | "unreconciled";
    policy_version: number;
    candidate_generation: number;
    base_amount_minor: string;
    override_reason: string | null;
    journal_id: string | null;
    reversal_journal_id: string | null;
    reconciled_by: string | null;
    reconciled_reason: string | null;
    unreconciled_by: string | null;
    unreconciled_reason: string | null;
  }>(
    "select id,attempt_number,state,policy_version,candidate_generation,base_amount_minor::text,override_reason,journal_id,reversal_journal_id,reconciled_by,reconciled_reason,unreconciled_by,unreconciled_reason from reconciliation_attempts where organization_id=$1 and reconciliation_id=$2 order by attempt_number",
    [org, id],
  );
  const mapped = [] as Record<string, unknown>[];
  const sourceIds = new Set<string>();
  for (const attempt of attempts.rows) {
    const allocations = await queryable.query<{
      id: string;
      target_type: string;
      commercial_document_id: string | null;
      expense_id: string | null;
      target_amount_minor: string;
      target_currency: string;
      base_amount_minor: string;
    }>(
      "select id,target_type,commercial_document_id,expense_id,target_amount_minor::text,target_currency,base_amount_minor::text from reconciliation_allocations where organization_id=$1 and reconciliation_id=$2 order by line_number",
      [org, attempt.id],
    );
    const adjustments = await queryable.query<{
      id: string;
      kind: string;
      account_code: string;
      side: string;
      base_amount_minor: string;
      description: string;
    }>(
      "select id,kind,account_code,side,base_amount_minor::text,description from reconciliation_adjustments where organization_id=$1 and reconciliation_id=$2 order by line_number",
      [org, attempt.id],
    );
    for (const a of allocations.rows) sourceIds.add(a.commercial_document_id ?? a.expense_id!);
    mapped.push({
      attemptNumber: attempt.attempt_number,
      state: attempt.state,
      policyVersion: attempt.policy_version,
      candidateGeneration: attempt.candidate_generation,
      bankBaseAmountMinor: attempt.base_amount_minor,
      allocations: allocations.rows.map((a) => ({
        id: a.id,
        targetType: a.target_type,
        targetId: a.commercial_document_id ?? a.expense_id,
        targetAmountMinor: a.target_amount_minor,
        targetCurrency: a.target_currency,
        baseAmountMinor: a.base_amount_minor,
      })),
      adjustments: adjustments.rows.map((a) => ({
        id: a.id,
        kind: a.kind,
        accountCode: a.account_code,
        side: a.side,
        baseAmountMinor: a.base_amount_minor,
        description: a.description,
      })),
      ...(attempt.override_reason ? { manualOverrideReason: attempt.override_reason } : {}),
      ...(attempt.journal_id ? { journalId: attempt.journal_id } : {}),
      ...(attempt.reversal_journal_id ? { reversalJournalId: attempt.reversal_journal_id } : {}),
      ...(attempt.reconciled_by ? { reconciledBy: attempt.reconciled_by } : {}),
      ...(attempt.reconciled_reason ? { reconciledReason: attempt.reconciled_reason } : {}),
      ...(attempt.unreconciled_by ? { unreconciledBy: attempt.unreconciled_by } : {}),
      ...(attempt.unreconciled_reason ? { unreconciledReason: attempt.unreconciled_reason } : {}),
    });
  }
  const current = attempts.rows.find((a) => a.attempt_number === p.current_attempt_number)!;
  const evidence = sourceIds.size
    ? await queryable.query<{ id: string }>(
        "select id from evidence_records where organization_id=$1 and subject_id=any($2::text[]) order by id",
        [org, [...sourceIds]],
      )
    : { rows: [] as { id: string }[] };
  return {
    id: p.id,
    bankTransactionId: p.bank_transaction_id,
    direction: p.direction,
    statementAmountMinor: p.statement_amount_minor,
    statementCurrency: p.statement_currency,
    state: current.state,
    currentAttemptNumber: p.current_attempt_number,
    attempts: mapped,
    resourceVersion: p.version,
    nextActions:
      current.state === "matched"
        ? ["reconcile"]
        : current.state === "reconciled"
          ? ["unreconcile"]
          : ["suggest", "match"],
    drilldown: {
      bankTransactionId: p.bank_transaction_id,
      ...(current.journal_id ? { journalId: current.journal_id } : {}),
      ...(current.reversal_journal_id ? { reversalJournalId: current.reversal_journal_id } : {}),
      sourceDocumentIds: [...sourceIds],
      evidenceIds: evidence.rows.map((e) => e.id),
    },
  };
}
