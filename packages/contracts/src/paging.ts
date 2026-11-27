// BR-READ-001..003: server-enforced bounded reads shared by API, CLI and web.
export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 100;
export const MAX_SUMMARY_LIST_LIMIT = 200;
export const MAX_FULL_VIEW_LIMIT = 25;
export const DEFAULT_MAX_RESPONSE_BYTES = 256 * 1024;
export const MIN_MAX_RESPONSE_BYTES = 32 * 1024;

export type ListView = "summary" | "full";

export interface RawListQuery {
  limit?: string | number | undefined;
  cursor?: string | undefined;
  view?: string | undefined;
  sort?: string | undefined;
  q?: string | undefined;
  includeTotal?: string | boolean | undefined;
}

export interface ListQuery {
  limit: number;
  limitClamped: boolean;
  cursor?: ListCursor;
  view: ListView;
  sort?: string;
  q?: string;
  includeTotal: boolean;
}

export interface ListCursor {
  /** Sort key values of the last returned record (stringified), then the tiebreaker id. */
  k: string[];
  id: string;
}

export interface PageInfo {
  limit: number;
  hasMore: boolean;
  nextCursor?: string;
  total?: number;
}

export interface PageMeta {
  count: number;
  bytes: number;
  truncated: boolean;
  limitClamped: boolean;
  hint?: string;
}

export class PagingError extends Error {
  constructor(readonly code: "LIMIT_INVALID" | "CURSOR_INVALID" | "VALIDATION_FAILED") {
    super(code);
  }
}

export function resolveMaxResponseBytes(value?: string | number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_RESPONSE_BYTES;
  return Math.max(MIN_MAX_RESPONSE_BYTES, Math.floor(parsed));
}

export function encodeCursor(cursor: ListCursor): string {
  return Buffer.from(JSON.stringify({ v: 1, k: cursor.k, id: cursor.id }), "utf8").toString(
    "base64url",
  );
}

export function decodeCursor(value: string): ListCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      v?: unknown;
      k?: unknown;
      id?: unknown;
    };
    if (
      parsed.v !== 1 ||
      !Array.isArray(parsed.k) ||
      !parsed.k.every((item) => typeof item === "string") ||
      typeof parsed.id !== "string" ||
      parsed.id.length === 0
    ) {
      throw new Error("shape");
    }
    return { k: parsed.k as string[], id: parsed.id };
  } catch {
    throw new PagingError("CURSOR_INVALID");
  }
}

export function parseListQuery(raw: RawListQuery): ListQuery {
  const view = raw.view === undefined || raw.view === "" ? "summary" : raw.view;
  if (view !== "summary" && view !== "full") throw new PagingError("VALIDATION_FAILED");
  let requested = DEFAULT_LIST_LIMIT;
  if (raw.limit !== undefined && raw.limit !== "") {
    const text = String(raw.limit).trim();
    if (!/^-?\d+$/.test(text)) throw new PagingError("LIMIT_INVALID");
    requested = Number.parseInt(text, 10);
  }
  const ceiling = view === "full" ? MAX_FULL_VIEW_LIMIT : MAX_SUMMARY_LIST_LIMIT;
  const limit = Math.min(Math.max(requested, 1), ceiling);
  const query: ListQuery = {
    limit,
    limitClamped: limit !== requested,
    view,
    includeTotal: raw.includeTotal === true || raw.includeTotal === "true",
  };
  if (raw.cursor) query.cursor = decodeCursor(raw.cursor);
  if (raw.sort) query.sort = raw.sort;
  if (raw.q) query.q = raw.q;
  return query;
}

export interface PaginateOptions<T> {
  limit: number;
  limitClamped: boolean;
  /** Cursor of a record, used to build `nextCursor` from the last returned record. */
  cursorOf: (row: T) => ListCursor;
  maxBytes?: number;
  total?: number;
}

/**
 * `rows` must contain at most `limit + 1` records in final sort order; the extra record only signals
 * that more data exists. Items are cut at a record boundary when the JSON size exceeds the budget.
 */
export function paginate<T>(rows: readonly T[], options: PaginateOptions<T>) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const hasExtra = rows.length > options.limit;
  let items = rows.slice(0, options.limit);
  let bytes = 2;
  const sizes = items.map((row) => Buffer.byteLength(JSON.stringify(row), "utf8") + 1);
  let kept = 0;
  for (const size of sizes) {
    if (kept > 0 && bytes + size > maxBytes) break;
    bytes += size;
    kept += 1;
  }
  const truncated = kept < items.length;
  items = items.slice(0, kept);
  const hasMore = hasExtra || truncated;
  const last = items.at(-1);
  const page: PageInfo = { limit: options.limit, hasMore };
  if (hasMore && last !== undefined) page.nextCursor = encodeCursor(options.cursorOf(last));
  if (options.total !== undefined) page.total = options.total;
  const meta: PageMeta = {
    count: items.length,
    bytes,
    truncated,
    limitClamped: options.limitClamped,
  };
  if (truncated) {
    meta.hint =
      "Narrow with dates/state/q, lower limit, or use view=summary; follow page.nextCursor.";
  }
  return { items, page, meta };
}
