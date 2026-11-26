import type { PoolClient } from "pg";

export async function buildFundingInferencePlan(c: PoolClient, org: string) {
  const rows = await c.query<{
    expense_id: string;
    current_account: string | null;
    account_id: string;
    account_code: string;
    evidence_ids: string[];
    evidence_count: string;
  }>(
    `select e.id expense_id,e.funding_financial_account_id current_account,
            fa.id account_id,fa.code account_code,
            array_agg(distinct ra.id) evidence_ids,count(distinct ra.id)::text evidence_count
       from expenses e
       join reconciliation_allocations ra on ra.organization_id=e.organization_id and ra.expense_id=e.id
       join reconciliation_attempts rat on rat.organization_id=ra.organization_id and rat.id=ra.reconciliation_id
       join payment_reconciliations pr on pr.organization_id=rat.organization_id and pr.id=rat.reconciliation_id and pr.direction='payment'
       join bank_transactions bt on bt.organization_id=rat.organization_id and bt.id=rat.bank_transaction_id
       join financial_accounts fa on fa.organization_id=bt.organization_id and fa.id=bt.financial_account_id
      where e.organization_id=$1 and e.state='posted' and rat.state='reconciled'
      group by e.id,e.funding_financial_account_id,fa.id,fa.code
      order by e.id,fa.id`,
    [org],
  );
  const grouped = new Map<string, typeof rows.rows>();
  for (const row of rows.rows)
    grouped.set(row.expense_id, [...(grouped.get(row.expense_id) ?? []), row]);
  const items: Record<string, unknown>[] = [];
  const unresolved: Record<string, unknown>[] = [];
  const all = await c.query<{ id: string; funding_financial_account_id: string | null }>(
    `select id,funding_financial_account_id from expenses where organization_id=$1 and state='posted'`,
    [org],
  );
  for (const expense of all.rows) {
    if (expense.funding_financial_account_id) continue;
    const matches = grouped.get(expense.id) ?? [];
    const accountIds = [...new Set(matches.map((m) => m.account_id))];
    if (accountIds.length === 1 && matches[0]) {
      const match = matches[0];
      items.push({
        expenseId: expense.id,
        currentFundingFinancialAccountId: null,
        suggestedFundingFinancialAccountId: match.account_id,
        accountCode: match.account_code,
        evidenceType: "reconciliation",
        evidenceIds: match.evidence_ids,
        confidence: "confirmed",
      });
    } else {
      unresolved.push({
        expenseId: expense.id,
        reason:
          matches.length === 0 ? "no_reconciled_payment_evidence" : "multiple_financial_accounts",
      });
    }
  }
  return {
    items,
    unresolved,
    counts: { assignable: items.length, unresolved: unresolved.length },
  };
}
