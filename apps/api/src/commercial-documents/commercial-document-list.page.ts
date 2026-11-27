import {
  PagingError,
  paginate,
  parseListQuery,
  resolveMaxResponseBytes,
  type RawListQuery,
} from "@naai-erp/contracts";
import {
  COMMERCIAL_DOCUMENT_SUMMARY_GROUPS,
  type CommercialDocumentSummaryGroup,
} from "./commercial-document-list.queries.js";
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
  const query = parseListQuery({ ...raw, view: "summary" });
  if (query.sort !== undefined && !["date_desc", "date_asc"].includes(query.sort)) {
    throw new PagingError("VALIDATION_FAILED");
  }
  const filters = compactFilters({ ...rawFilters, q: query.q });
  const summary = raw.view === "summary";
  const rows = await store.list(organizationId, filters, {
    fetch: query.limit + 1,
    summary,
    ...(query.sort === "date_asc" ? { ascending: true } : {}),
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

function compactFilters(filters: Filters) {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
}

export async function countCommercialDocumentRows(
  store: PgCommercialDocumentStore,
  organizationId: string,
  filters: Filters,
  q?: string,
) {
  return { total: await store.count(organizationId, compactFilters({ ...filters, q })) };
}

export async function summarizeCommercialDocumentRows(
  store: PgCommercialDocumentStore,
  organizationId: string,
  filters: Filters,
  groupBy: string | undefined,
  q?: string,
) {
  if (!COMMERCIAL_DOCUMENT_SUMMARY_GROUPS.includes(groupBy as CommercialDocumentSummaryGroup)) {
    throw new PagingError("VALIDATION_FAILED");
  }
  return store.summary(
    organizationId,
    compactFilters({ ...filters, q }),
    groupBy as CommercialDocumentSummaryGroup,
  );
}
