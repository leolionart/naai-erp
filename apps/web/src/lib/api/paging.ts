/** Client side of the bounded list contract (BR-READ-001/002): the server declares `page`, we follow it. */

type Page = { hasMore?: boolean; nextCursor?: string };
type PagedEnvelope = {
  data?: unknown;
  page?: Page;
  meta?: Readonly<Record<string, unknown>>;
};

export const MAX_AUTO_PAGES = 50;
const FOLLOW_PAGE_LIMIT = 200;

export function withPagingParams(path: string, limit?: number, cursor?: string): string {
  const [base = "", query = ""] = path.split("?", 2);
  const params = new URLSearchParams(query);
  params.delete("limit");
  params.delete("cursor");
  if (limit !== undefined) params.set("limit", String(limit));
  if (cursor) params.set("cursor", cursor);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** True when the caller already manages paging itself, so nothing may be followed automatically. */
export function isSelfPaged(path: string): boolean {
  return /[?&](limit|cursor)=/.test(path);
}

/**
 * Appends the following pages to `first` until `page.hasMore` is false or the safety cap is reached
 * (then `meta.truncated` is set, so a partial list is never presented as complete).
 */
export async function followPages<E extends PagedEnvelope>(
  first: E,
  fetchPage: (path: string) => Promise<E>,
  path: string,
): Promise<E> {
  const merged = first as E & { page?: Page; meta?: Record<string, unknown> };
  let page = merged.page;
  for (let pages = 1; page?.hasMore && page.nextCursor; pages += 1) {
    if (pages >= MAX_AUTO_PAGES) {
      merged.meta = { ...merged.meta, truncated: true };
      return merged;
    }
    const next = await fetchPage(withPagingParams(path, FOLLOW_PAGE_LIMIT, page.nextCursor));
    const data = merged.data as unknown[] | { items: unknown[] };
    const more = next.data as unknown[] | { items: unknown[] };
    if (Array.isArray(data) && Array.isArray(more)) data.push(...more);
    else if (!Array.isArray(data) && !Array.isArray(more)) data.items.push(...more.items);
    page = next.page;
    merged.page = page;
    if (!Array.isArray(data))
      Object.assign(data, { hasMore: page?.hasMore, nextCursor: page?.nextCursor });
  }
  return merged;
}

/** Reads `path` and follows every following page; for callers that bring their own fetch wrapper. */
export async function fetchAllPages<E extends PagedEnvelope>(
  fetchPage: (path: string) => Promise<E>,
  path: string,
): Promise<E> {
  return followPages(await fetchPage(path), fetchPage, path);
}
