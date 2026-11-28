import type { Pool } from "pg";
import type { RawListQuery } from "@naai-erp/contracts";
import {
  countRows,
  cursorParams,
  keysetSql,
  parseDatedList,
  toListResponse,
} from "../common/dated-list.js";

// A correlated subselect keeps the page cut on the (date, id) index before any line is read.
const LINES_SQL = `coalesce((select json_agg(l order by l.line_number) from journal_lines l
  where l.organization_id=j.organization_id and l.journal_id=j.id), '[]') as lines`;
const FROM_WHERE = "journal_entries j where j.organization_id=$1";

/**
 * Keyset ordered by journal_date, id. Lines are embedded unless the caller asks for `view=summary`;
 * the response size budget still bounds the page (BR-READ-003).
 */
export async function listJournalPage(pool: Pool, organizationId: string, raw: RawListQuery) {
  const { query, ascending, search } = parseDatedList(raw, { view: "summary" });
  const withLines = raw.view !== "summary";
  const keyset = keysetSql("j.journal_date", "j.id", ascending, 2, 3);
  const result = await pool.query(
    `select j.*, j.journal_date::text as journal_date_key${withLines ? `, ${LINES_SQL}` : ""}
       from journal_entries j
      where j.organization_id=$1
        and ${keyset.where}
        and ($5::text is null or j.description ilike $5 or j.id ilike $5)
      order by ${keyset.orderBy}
      limit $4`,
    [organizationId, ...cursorParams(query.cursor), query.limit + 1, search],
  );
  const total = query.includeTotal
    ? await countRows(pool, FROM_WHERE, "", [organizationId])
    : undefined;
  return toListResponse(
    result.rows as { id: string; journal_date_key: string }[],
    query,
    (row) => row.journal_date_key,
    {
      ...(total === undefined ? {} : { total }),
      mapItem: ({ journal_date_key: _key, ...row }) => row,
    },
  );
}
