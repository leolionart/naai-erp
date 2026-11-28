import type { Pool } from "pg";
import type { RawListQuery } from "@naai-erp/contracts";
import {
  countRows,
  cursorParams,
  keysetSql,
  parseDatedList,
  toListResponse,
} from "../common/dated-list.js";

export interface BankTransactionFilters {
  financialAccountId?: string;
  state?: string;
  from?: string;
  to?: string;
}

// Parameters $1..$6 are shared by the page and the optional total.
const TRANSACTION_FILTER = `organization_id=$1
       and ($2::text is null or financial_account_id=$2)
       and ($3::text is null or state::text=$3)
       and ($4::date is null or booking_date >= $4)
       and ($5::date is null or booking_date <= $5)
       and ($6::text is null or description ilike $6 or reference ilike $6 or counterparty_name ilike $6)`;

/** Keyset page of bank transactions ordered by booking_date, id (BR-READ-002). */
export async function listBankTransactionPage(
  pool: Pool,
  organizationId: string,
  filters: BankTransactionFilters,
  raw: RawListQuery,
) {
  const { query, ascending, search } = parseDatedList(raw);
  const keyset = keysetSql("booking_date", "id", ascending, 7, 8);
  const params = [
    organizationId,
    filters.financialAccountId ?? null,
    filters.state ?? null,
    filters.from ?? null,
    filters.to ?? null,
    search,
  ];
  const result = await pool.query(
    `select *, booking_date::text booking_date_key from bank_transactions
      where ${TRANSACTION_FILTER} and ${keyset.where}
      order by ${keyset.orderBy}
      limit $9`,
    [...params, ...cursorParams(query.cursor), query.limit + 1],
  );
  const total = query.includeTotal
    ? await countRows(pool, "bank_transactions", `where ${TRANSACTION_FILTER}`, params)
    : undefined;
  return toListResponse(
    result.rows as { id: string; booking_date_key: string }[],
    query,
    (row) => row.booking_date_key,
    {
      ...(total === undefined ? {} : { total }),
      mapItem: ({ booking_date_key: _key, ...row }) => row,
    },
  );
}

/** Keyset page of statement imports ordered by created_at, id. */
export async function listBankImportPage(
  pool: Pool,
  organizationId: string,
  financialAccountId: string | undefined,
  raw: RawListQuery,
) {
  const { query, ascending } = parseDatedList(raw);
  const keyset = keysetSql("created_at", "id", ascending, 3, 4, "timestamptz");
  const result = await pool.query(
    `select *, created_at::text created_at_key from bank_statement_imports
      where organization_id=$1 and ($2::text is null or financial_account_id=$2)
        and ${keyset.where}
      order by ${keyset.orderBy}
      limit $5`,
    [organizationId, financialAccountId ?? null, ...cursorParams(query.cursor), query.limit + 1],
  );
  return toListResponse(
    result.rows as { id: string; created_at_key: string }[],
    query,
    (row) => row.created_at_key,
    { mapItem: ({ created_at_key: _key, ...row }) => row },
  );
}
