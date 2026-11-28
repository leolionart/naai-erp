import type { Pool } from "pg";
import {
  PagingError,
  paginate,
  parseListQuery,
  resolveMaxResponseBytes,
  type ListCursor,
  type ListQuery,
  type RawListQuery,
} from "@naai-erp/contracts";

/**
 * Shared building blocks for the lists ordered by (date, id): expenses, commercial documents and
 * journals (BR-READ-001..005). Each resource keeps its own SELECT and filters; everything that is
 * identical (query parsing, keyset SQL, response shape, count, grouped summary) lives here.
 */

const SORTS = ["date_desc", "date_asc"];
const MAX_SUMMARY_GROUPS = 120;

export function likePattern(q: string | undefined): string | null {
  return q ? `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%` : null;
}

/** Parses limit/cursor/sort/q once and validates the sort for every dated list. */
export function parseDatedList(raw: RawListQuery, overrides: RawListQuery = {}) {
  const query = parseListQuery({ ...raw, ...overrides });
  if (query.sort !== undefined && !SORTS.includes(query.sort)) {
    throw new PagingError("VALIDATION_FAILED");
  }
  return { query, ascending: query.sort === "date_asc", search: likePattern(query.q) };
}

/**
 * Keyset predicate and ORDER BY for (dateColumn, idColumn). The columns are trusted constants; the
 * cursor values are bound as `$dateParam` (date, or timestamptz for `valueType: "timestamptz"`)
 * and `$idParam` (text).
 */
export function keysetSql(
  dateColumn: string,
  idColumn: string,
  ascending: boolean,
  dateParam: number,
  idParam: number,
  valueType: "date" | "timestamptz" = "date",
) {
  const date = `$${dateParam}::${valueType}`;
  const compare = ascending ? ">" : "<";
  return {
    where: `(${date} is null or ${dateColumn} ${compare} ${date} or (${dateColumn} = ${date} and ${idColumn} > $${idParam}::text))`,
    orderBy: `${dateColumn} ${ascending ? "asc" : "desc"},${idColumn}`,
  };
}

export function cursorParams(cursor: ListCursor | undefined) {
  return [cursor?.k[0] ?? null, cursor?.id ?? null];
}

/** Cuts `rows` (limit + 1 fetched) into the declared page: items, hasMore, nextCursor, meta. */
export function toListResponse<T extends { id: string }>(
  rows: T[],
  query: ListQuery,
  dateOf: (row: T) => string,
  options: { total?: number; mapItem?: (row: T) => unknown } = {},
) {
  const page = paginate(rows, {
    limit: query.limit,
    limitClamped: query.limitClamped,
    cursorOf: (row) => ({ k: [dateOf(row)], id: row.id }),
    maxBytes: resolveMaxResponseBytes(process.env.API_MAX_LIST_RESPONSE_BYTES),
    ...(options.total === undefined ? {} : { total: options.total }),
  });
  const items = options.mapItem ? page.items.map(options.mapItem) : page.items;
  // `data` is the item-shaped body; `items`/`page` serve resources whose body is a bare array.
  return { data: { items, ...page.page }, items, page: page.page, meta: page.meta };
}

export async function countRows(
  pool: Pool,
  fromWhere: string,
  filterSql: string,
  params: unknown[],
): Promise<number> {
  const result = await pool.query(
    `select count(*)::int total from ${fromWhere}\n${filterSql}`,
    params,
  );
  return (result.rows[0]?.total as number | undefined) ?? 0;
}

export function assertGroup<T extends string>(
  groupBy: string | undefined,
  allowed: readonly T[],
): T {
  if (!allowed.includes(groupBy as T)) throw new PagingError("VALIDATION_FAILED");
  return groupBy as T;
}

/** Count and gross total per group and currency, at most 120 groups, so nobody downloads records to add up. */
export async function summarizeGroups(
  pool: Pool,
  input: {
    fromWhere: string;
    filterSql: string;
    params: unknown[];
    keySql: string;
    currencyColumn: string;
    amountColumn: string;
    groupBy: string;
  },
) {
  const result = await pool.query(
    `select ${input.keySql} key, ${input.currencyColumn} currency, count(*)::int count,
            coalesce(sum(${input.amountColumn}),0)::text "grossMinor"
       from ${input.fromWhere}
${input.filterSql}
      group by 1,2 order by ${input.groupBy === "month" ? "1 desc" : "3 desc, 1"}, 2
      limit ${MAX_SUMMARY_GROUPS + 1}`,
    input.params,
  );
  return {
    groupBy: input.groupBy,
    groups: result.rows.slice(0, MAX_SUMMARY_GROUPS),
    truncated: result.rows.length > MAX_SUMMARY_GROUPS,
  };
}
