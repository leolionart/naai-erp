import type { RawListQuery } from "@naai-erp/contracts";
import { assertGroup, parseDatedList, toListResponse } from "../common/dated-list.js";
import { COMMERCIAL_DOCUMENT_SUMMARY_GROUPS } from "./commercial-document-list.queries.js";
import type { PgCommercialDocumentStore } from "./pg-commercial-document.store.js";

type Filters = Record<string, string | undefined>;

const withValues = (filters: Filters) =>
  Object.fromEntries(Object.entries(filters).filter(([, value]) => value));

/**
 * Keyset page ordered by document_date, id. Lines and allocations are embedded unless
 * `view=summary` (BR-READ-004); the size budget bounds the page either way (BR-READ-003).
 */
export async function listCommercialDocumentPage(
  store: PgCommercialDocumentStore,
  organizationId: string,
  filters: Filters,
  raw: RawListQuery,
) {
  const { query, ascending } = parseDatedList(raw, { view: "summary" });
  const rows = await store.list(organizationId, withValues({ ...filters, q: query.q }), {
    fetch: query.limit + 1,
    summary: raw.view === "summary",
    ascending,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  });
  return toListResponse(
    rows as { id: string; document_date: string }[],
    query,
    (row) => row.document_date,
  );
}

export async function countCommercialDocumentRows(
  store: PgCommercialDocumentStore,
  organizationId: string,
  filters: Filters,
  q?: string,
) {
  return { total: await store.count(organizationId, withValues({ ...filters, q })) };
}

export function summarizeCommercialDocumentRows(
  store: PgCommercialDocumentStore,
  organizationId: string,
  filters: Filters,
  groupBy: string | undefined,
  q?: string,
) {
  return store.summary(
    organizationId,
    withValues({ ...filters, q }),
    assertGroup(groupBy, COMMERCIAL_DOCUMENT_SUMMARY_GROUPS),
  );
}
