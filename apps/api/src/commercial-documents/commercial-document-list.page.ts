import {
  paginate,
  parseListQuery,
  resolveMaxResponseBytes,
  type RawListQuery,
} from "@naai-erp/contracts";
import type { PgCommercialDocumentStore } from "./pg-commercial-document.store.js";

type Filters = Record<string, string | undefined>;

/**
 * Keyset page ordered by document_date desc, id asc (BR-READ-002). Lines and allocations are embedded
 * unless `view=summary` (BR-READ-004); the size budget bounds the page either way (BR-READ-003).
 */
export async function listCommercialDocumentPage(
  store: PgCommercialDocumentStore,
  organizationId: string,
  rawFilters: Filters,
  raw: RawListQuery,
) {
  const filters = Object.fromEntries(Object.entries(rawFilters).filter(([, value]) => value));
  const query = parseListQuery({ ...raw, view: "summary" });
  const summary = raw.view === "summary";
  const rows = await store.list(organizationId, filters, {
    fetch: query.limit + 1,
    summary,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  });
  const page = paginate(rows as { id: string; document_date: string }[], {
    limit: query.limit,
    limitClamped: query.limitClamped,
    cursorOf: (row) => ({ k: [row.document_date], id: row.id }),
    maxBytes: resolveMaxResponseBytes(process.env.API_MAX_LIST_RESPONSE_BYTES),
  });
  return { data: { items: page.items, ...page.page }, meta: page.meta };
}
