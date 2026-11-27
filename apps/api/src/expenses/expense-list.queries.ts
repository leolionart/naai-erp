import type { Pool } from "pg";
import { decodeCursor, type ListCursor } from "@naai-erp/contracts";

export interface ExpenseListFilters {
  state?: string;
  expenseClass?: string;
  payeePartyId?: string;
  fundingTreatment?: string;
  startsOn?: string;
  endsOn?: string;
  /** Case-insensitive search over purpose, id and payee id. */
  q?: string;
}

export interface ExpenseListPaging {
  /** Number of rows to fetch (callers pass limit + 1 to detect another page). */
  fetch: number;
  cursor?: ListCursor;
  /** `date_asc` flips the keyset order to expense_date asc, id asc. */
  ascending?: boolean;
}

export type ExpenseSummaryGroup = "month" | "state" | "class" | "payee" | "category";
export const EXPENSE_SUMMARY_GROUPS: readonly ExpenseSummaryGroup[] = [
  "month",
  "state",
  "class",
  "payee",
  "category",
];
const MAX_SUMMARY_GROUPS = 120;

// Parameters $1..$8 are shared by list, count and summary so filters never drift apart.
const FILTER_SQL = `       and (($2::text is not null and e.state::text=$2) or ($2::text is null and e.state<>'reversed'))
       and ($3::text is null or e.expense_class::text=$3)
       and ($4::text is null or e.payee_party_id=$4)
       and ($5::text is null or exists(
         select 1 from expense_lines l
         left join expense_categories c on c.organization_id=l.organization_id
          and c.code=coalesce(l.expense_category_code,l.dimensions->>'category')
         where l.organization_id=e.organization_id and l.expense_id=e.id
           and coalesce(l.funding_treatment,c.funding_treatment)::text=$5
       )) and ($6::date is null or e.expense_date >= $6::date)
       and ($7::date is null or e.expense_date <= $7::date)
       and ($8::text is null or e.business_purpose ilike $8 or e.id ilike $8 or coalesce(e.payee_party_id,'') ilike $8)`;

function filterParams(org: string, filters: ExpenseListFilters) {
  return [
    org,
    filters.state ?? null,
    filters.expenseClass ?? null,
    filters.payeePartyId ?? null,
    filters.fundingTreatment ?? null,
    filters.startsOn ?? null,
    filters.endsOn ?? null,
    filters.q ? `%${filters.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null,
  ];
}

// Keyset order: expense_date desc, id asc (BR-READ-002).
export async function listExpenses(
  pool: Pool,
  org: string,
  filters: ExpenseListFilters,
  paging: ExpenseListPaging,
) {
  const cursor = paging.cursor;
  const result = await pool.query(
    `select e.*,e.expense_date::text expense_date,e.paid_on::text paid_on,e.funding_financial_account_id "fundingFinancialAccountId",
       e.owner_funding_movement_id "ownerFundingId",
       (select m.bank_transaction_id from owner_funding_movements m where m.organization_id=e.organization_id and m.id=e.owner_funding_movement_id) "ownerFundingTransactionId",
       e.payment_method "paymentMethod",e.paid_on::text "paidOn",e.payment_evidence_ref "paymentEvidenceRef",
       e.transaction_evidence "transactionEvidence",e.payment_evidence_missing "paymentEvidenceMissing",
       coalesce(e.draft_reasons,'[]'::jsonb) "draftReasons",
       case when e.state='draft' then coalesce(e.draft_reasons,'[]'::jsonb) else '[]'::jsonb end reasons,
       e.original_expense_id "originalExpenseId",
       (select r.id from expenses r where r.organization_id=e.organization_id and r.original_expense_id=e.id order by r.created_at desc limit 1) "replacementExpenseId",
       coalesce((select jsonb_agg(distinct relationship.project_id order by relationship.project_id)
         from (
           select l2.dimensions->>'projectId' project_id
             from expense_lines l2
            where l2.organization_id=e.organization_id and l2.expense_id=e.id
           union
           select a2.dimensions->>'projectId'
             from expense_allocations a2
            where a2.organization_id=e.organization_id and a2.expense_id=e.id
         ) relationship where relationship.project_id is not null),'[]'::jsonb) "projectIds",
       coalesce((select jsonb_agg(distinct relationship.contract_id order by relationship.contract_id)
         from (
           select l2.dimensions->>'contractId' contract_id
             from expense_lines l2
            where l2.organization_id=e.organization_id and l2.expense_id=e.id
           union
           select a2.dimensions->>'contractId'
             from expense_allocations a2
            where a2.organization_id=e.organization_id and a2.expense_id=e.id
         ) relationship where relationship.contract_id is not null),'[]'::jsonb) "contractIds",
       (select coalesce(l.expense_category_code,l.dimensions->>'category') from expense_lines l
        where l.organization_id=e.organization_id and l.expense_id=e.id
        order by l.line_number limit 1) category,
       coalesce((select jsonb_agg(x.value order by x.value) from (
         select distinct coalesce(l.funding_treatment,c.funding_treatment) value
           from expense_lines l
           left join expense_categories c on c.organization_id=l.organization_id
            and c.code=coalesce(l.expense_category_code,l.dimensions->>'category')
          where l.organization_id=e.organization_id and l.expense_id=e.id
            and coalesce(l.funding_treatment,c.funding_treatment) is not null
       ) x),'[]'::jsonb) "fundingTreatments"
       from expenses e where e.organization_id=$1
${FILTER_SQL}
       and ($9::date is null or ${paging.ascending ? "e.expense_date > $9::date" : "e.expense_date < $9::date"} or (e.expense_date = $9::date and e.id > $10::text))
       order by e.expense_date ${paging.ascending ? "asc" : "desc"},e.id
       limit $11`,
    [...filterParams(org, filters), cursor?.k[0] ?? null, cursor?.id ?? null, paging.fetch],
  );
  return result.rows;
}

export async function countExpenses(pool: Pool, org: string, filters: ExpenseListFilters) {
  const result = await pool.query(
    `select count(*)::int total from expenses e where e.organization_id=$1
${FILTER_SQL}`,
    filterParams(org, filters),
  );
  return (result.rows[0]?.total as number | undefined) ?? 0;
}

const GROUP_KEY_SQL: Record<ExpenseSummaryGroup, string> = {
  month: "to_char(e.expense_date,'YYYY-MM')",
  state: "e.state::text",
  class: "e.expense_class::text",
  payee: "coalesce(e.payee_party_id,'(none)')",
  category: `coalesce((select coalesce(l.expense_category_code,l.dimensions->>'category') from expense_lines l
        where l.organization_id=e.organization_id and l.expense_id=e.id order by l.line_number limit 1),'(none)')`,
};

export async function summarizeExpenses(
  pool: Pool,
  org: string,
  filters: ExpenseListFilters,
  groupBy: ExpenseSummaryGroup,
) {
  const key = GROUP_KEY_SQL[groupBy];
  const result = await pool.query(
    `select ${key} key, e.currency, count(*)::int count, coalesce(sum(e.gross_minor),0)::text "grossMinor"
       from expenses e where e.organization_id=$1
${FILTER_SQL}
      group by 1,2 order by ${groupBy === "month" ? "1 desc" : "3 desc, 1"}, 2
      limit ${MAX_SUMMARY_GROUPS + 1}`,
    filterParams(org, filters),
  );
  const rows = result.rows.slice(0, MAX_SUMMARY_GROUPS);
  return { groupBy, groups: rows, truncated: result.rows.length > MAX_SUMMARY_GROUPS };
}

export function expenseCursorOf(row: { expense_date: string; id: string }): ListCursor {
  return { k: [row.expense_date], id: row.id };
}

export function parseExpenseCursor(value: string): ListCursor {
  return decodeCursor(value);
}
