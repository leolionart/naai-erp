import type { PoolClient } from "pg";
import type { CreateExpenseInput } from "./expense.types.js";

export type ExpenseFundingResolverStore = Readonly<{
  fundingAccount(
    organizationId: string,
    financialAccountId: string,
  ): Promise<{ ledger_account_code: string; currency: string } | undefined>;
  accountRootType?(organizationId: string, code: string): Promise<string | undefined>;
  resolveOwnerCurrentAccount?(
    organizationId: string,
    expenseDate: string,
  ): Promise<string | undefined>;
  resolveOwnerReceivableAccount?(organizationId: string): Promise<string | undefined>;
}>;

/**
 * Resolve the counter account and owner-receivable (`1388`) lines for an expense
 * under `BR-FUND-007`:
 * - `CASH-OWNER-CUSTODY` -> `111-OWNER-CUSTODY` (from `financial_accounts.ledger_account_code`)
 * - `CASH-COMPANY` -> `111-CASH` (from `financial_accounts.ledger_account_code`)
 * - `owner_paid` -> configured Balance Sheet `owner_current` (`3388*`)
 * - `expenseClass === "owner_personal"` -> personal spending taken from company
 *   funds, recorded to owner receivable `1388` / `1388-OWNER` (`asset`), never
 *   to P&L expenses (`6xx`/`8xx`), VAT credit, or CIT deductions.
 */
export async function applyExpenseFundingAndOwnerPersonalPolicy(
  organizationId: string,
  input: CreateExpenseInput,
  resolvedFunding: CreateExpenseInput["funding"],
  store: ExpenseFundingResolverStore,
): Promise<CreateExpenseInput> {
  const explicitCounter = input.counterAccountCode?.trim();
  const explicitFinancialId =
    input.fundingFinancialAccountId?.trim() || resolvedFunding?.financialAccountId?.trim();

  let derivedCounter = explicitCounter ?? "";
  if (!derivedCounter && explicitFinancialId) {
    const account = await store.fundingAccount(organizationId, explicitFinancialId);
    if (!account || (input.currency && account.currency !== input.currency)) {
      throw new Error("EXPENSE_FUNDING_ACCOUNT_NOT_AVAILABLE");
    }
    derivedCounter = account.ledger_account_code;
  }
  if (!derivedCounter && resolvedFunding) {
    if (resolvedFunding.type === "owner_paid") {
      derivedCounter =
        (await store.resolveOwnerCurrentAccount?.(organizationId, input.expenseDate)) ??
        "3388-OWNER";
    } else if (resolvedFunding.type === "owner_custody_cash") {
      derivedCounter = "111-OWNER-CUSTODY";
    } else if (resolvedFunding.type === "company_bank") {
      derivedCounter = "112-BANK";
    } else {
      derivedCounter = "111-CASH";
    }
  }

  let lines = input.lines;
  if (input.expenseClass === "owner_personal") {
    if (
      resolvedFunding?.type === "owner_paid" ||
      derivedCounter === "3388" ||
      derivedCounter.startsWith("3388-")
    ) {
      throw new Error("OWNER_PERSONAL_REQUIRES_COMPANY_FUNDS");
    }
    const defaultReceivable =
      (await store.resolveOwnerReceivableAccount?.(organizationId)) ?? "1388";
    const resolvedLines: Array<CreateExpenseInput["lines"][number]> = [];
    for (const line of input.lines) {
      const code = line.postingAccountCode?.trim() || defaultReceivable;
      if (store.accountRootType) {
        const rootType = await store.accountRootType(organizationId, code);
        if (rootType && rootType !== "asset") {
          throw new Error("OWNER_PERSONAL_REQUIRES_RECEIVABLE_ACCOUNT");
        }
      }
      resolvedLines.push({
        ...line,
        postingAccountCode: code,
        managementState: "invalid",
        citState: "ineligible",
        citEligibleMinor: "0",
        vatState: "ineligible",
        vatEligibleMinor: "0",
      });
    }
    lines = resolvedLines;
  }

  return {
    ...input,
    lines,
    ...(resolvedFunding ? { funding: resolvedFunding } : {}),
    ...(derivedCounter ? { counterAccountCode: derivedCounter } : {}),
    ...(explicitFinancialId && !input.fundingFinancialAccountId
      ? { fundingFinancialAccountId: explicitFinancialId }
      : {}),
  };
}

export async function buildExpenseFundingInferencePlan(c: PoolClient, org: string) {
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
