import { Injectable } from "@nestjs/common";
import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import {
  PagingError,
  decodeCursor,
  paginate,
  parseListQuery,
  resolveMaxResponseBytes,
  type RawListQuery,
} from "@naai-erp/contracts";
import { map } from "rxjs";

// Routes that are aggregates, exports/downloads or already own their cursor format.
const EXCLUDED_PATH =
  /\/(reports|master-data|operational-logs|exports?|download|summary|count|capabilities|openapi\.json|health)(\/|\?|$)/;
const OWN_PAGING_KEYS = ["nextCursor", "hasMore", "limit", "page"] as const;

type Body = {
  data?: unknown;
  page?: unknown;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
};

/**
 * BR-READ-001/003 safety net for organization-scoped collection GETs that do not paginate yet.
 * The page is bounded server side and the response always declares it (`page`, `meta`,
 * `data.hasMore`/`nextCursor`), so no client can mistake a partial page for the full list.
 * The query still loads the organization's rows; tracked per route in docs/api/list-endpoint-inventory.md.
 */
@Injectable()
export class BoundedListInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<{
      method?: string;
      url?: string;
      params?: Record<string, string>;
      query?: RawListQuery;
    }>();
    const eligible =
      (request.method ?? "GET").toUpperCase() === "GET" &&
      Boolean(request.params?.organizationId) &&
      !EXCLUDED_PATH.test(request.url ?? "");
    if (!eligible) return next.handle();
    return next
      .handle()
      .pipe(map((body: unknown) => this.bound(body as Body, request.query ?? {})));
  }

  private bound(body: Body, raw: RawListQuery): unknown {
    const data = body?.data;
    const rows = Array.isArray(data) ? data : (data as { items?: unknown } | undefined)?.items;
    if (!Array.isArray(rows) || body.page !== undefined) return body;
    if (!Array.isArray(data) && OWN_PAGING_KEYS.some((key) => key in (data as object))) return body;
    const query = parseListQuery({ ...raw, cursor: undefined });
    let start = 0;
    if (raw.cursor) {
      try {
        start = this.resolveStart(rows as { id?: unknown }[], decodeCursor(raw.cursor));
      } catch (error) {
        // A foreign cursor format on a route that owns its paging is passed through untouched.
        if (rows.length <= 200 || !(error instanceof PagingError)) return body;
        throw error;
      }
    }
    const window = rows.slice(start, start + query.limit + 1) as { id?: unknown }[];
    const result = paginate(window, {
      limit: query.limit,
      limitClamped: query.limitClamped,
      maxBytes: resolveMaxResponseBytes(process.env.API_MAX_LIST_RESPONSE_BYTES),
      total: rows.length,
      cursorOf: (row) => ({
        k: [String(start + window.indexOf(row) + 1)],
        id: typeof row.id === "string" && row.id ? row.id : `#${start + window.indexOf(row) + 1}`,
      }),
    });
    const paging = { ...result.page, total: rows.length };
    return {
      ...body,
      data: Array.isArray(data)
        ? result.items
        : { ...(data as object), items: result.items, ...paging },
      page: paging,
      meta: { ...body.meta, ...result.meta },
    };
  }

  private resolveStart(rows: { id?: unknown }[], cursor: { k: string[]; id: string }) {
    const position = Number.parseInt(cursor.k[0] ?? "", 10);
    if (!Number.isInteger(position) || position < 0 || position > rows.length) {
      throw new PagingError("CURSOR_INVALID");
    }
    const previous = rows[position - 1];
    if (previous && typeof previous.id === "string" && previous.id !== cursor.id) {
      // The list changed since the cursor was issued: resume after the remembered record.
      const index = rows.findIndex((row) => row.id === cursor.id);
      if (index >= 0) return index + 1;
    }
    return position;
  }
}
