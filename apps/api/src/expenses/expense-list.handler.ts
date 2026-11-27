import type { RawListQuery } from "@naai-erp/contracts";
import { assertGroup, parseDatedList, toListResponse } from "../common/dated-list.js";
import { EXPENSE_SUMMARY_GROUPS, type ExpenseListFilters } from "./expense-list.queries.js";
import type { PgExpenseStore } from "./pg-expense.store.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FUNDING_TREATMENTS = ["company_funds", "owner_paid_company_cost", "tax_only_non_cash"];

export function validateExpenseFilters(filters: ExpenseListFilters): void {
  if (
    (filters.startsOn && !ISO_DATE.test(filters.startsOn)) ||
    (filters.endsOn && !ISO_DATE.test(filters.endsOn)) ||
    (filters.startsOn && filters.endsOn && filters.startsOn > filters.endsOn) ||
    (filters.fundingTreatment && !FUNDING_TREATMENTS.includes(filters.fundingTreatment))
  ) {
    throw new Error("VALIDATION_FAILED");
  }
}

/** Bounded, keyset-paginated expense list (BR-READ-001..003). */
export async function listExpensePage(
  store: PgExpenseStore,
  organizationId: string,
  filters: ExpenseListFilters,
  raw: RawListQuery,
) {
  validateExpenseFilters(filters);
  const { query, ascending } = parseDatedList(raw);
  const rows = await store.list(organizationId, filters, {
    fetch: query.limit + 1,
    ascending,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  });
  const total = query.includeTotal ? await store.count(organizationId, filters) : undefined;
  return toListResponse(
    rows as { expense_date: string; id: string }[],
    query,
    (row) => row.expense_date,
    total === undefined ? {} : { total },
  );
}

export async function countExpenseRows(
  store: PgExpenseStore,
  organizationId: string,
  filters: ExpenseListFilters,
) {
  validateExpenseFilters(filters);
  return { total: await store.count(organizationId, filters) };
}

export async function summarizeExpenseRows(
  store: PgExpenseStore,
  organizationId: string,
  filters: ExpenseListFilters,
  groupBy: string | undefined,
) {
  validateExpenseFilters(filters);
  return store.summary(organizationId, filters, assertGroup(groupBy, EXPENSE_SUMMARY_GROUPS));
}
