import type { Pool } from "pg";
import {
  paginate,
  parseListQuery,
  resolveMaxResponseBytes,
  type ListCursor,
  type RawListQuery,
} from "@naai-erp/contracts";

const LINES_SQL = `coalesce(json_agg(l order by l.line_number) filter (where l.line_number is not null), '[]') as lines`;

/**
 * Keyset ordered by journal_date desc, id asc (BR-READ-002). Lines are embedded unless the caller asks
 * for `view=summary`; the response size budget still bounds the page (BR-READ-003).
 */
export async function listJournalPage(pool: Pool, organizationId: string, raw: RawListQuery) {
  const query = parseListQuery({ ...raw, view: "summary" });
  const withLines = raw.view !== "summary";
  const cursor: ListCursor | undefined = query.cursor;
  const result = await pool.query(
    `select j.*, j.journal_date::text as journal_date_key${withLines ? `, ${LINES_SQL}` : ""}
       from journal_entries j
       ${withLines ? "left join journal_lines l on l.organization_id=j.organization_id and l.journal_id=j.id" : ""}
      where j.organization_id=$1
        and ($2::date is null or j.journal_date < $2::date or (j.journal_date = $2::date and j.id > $3::text))
      group by j.organization_id,j.id
      order by j.journal_date desc,j.id
      limit $4`,
    [organizationId, cursor?.k[0] ?? null, cursor?.id ?? null, query.limit + 1],
  );
  const total = query.includeTotal
    ? ((
        await pool.query(
          "select count(*)::int total from journal_entries where organization_id=$1",
          [organizationId],
        )
      ).rows[0]?.total as number)
    : undefined;
  const page = paginate(result.rows as { id: string; journal_date_key: string }[], {
    limit: query.limit,
    limitClamped: query.limitClamped,
    cursorOf: (row) => ({ k: [row.journal_date_key], id: row.id }),
    maxBytes: resolveMaxResponseBytes(process.env.API_MAX_LIST_RESPONSE_BYTES),
    ...(total === undefined ? {} : { total }),
  });
  const items = page.items.map(({ journal_date_key: _key, ...row }) => row);
  return { data: { items, ...page.page }, meta: page.meta };
}
