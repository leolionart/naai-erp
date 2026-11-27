import { organizationApiRoot, type ApiConnectionSettingsV1 } from "./connection";
import { IdempotencyRegistry, mutationFingerprint } from "./idempotency";
import { ApiClientError, isApiEnvelope, type ApiEnvelope, type ApiErrorBody } from "./types";

export type ApiRequestOptions = Readonly<{
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  expectedVersion?: string;
  idempotencyKey?: string;
  correlationId?: string;
  signal?: AbortSignal;
}>;

export function createApiClient(input: {
  connection: () => ApiConnectionSettingsV1;
  token: () => string;
  fetcher?: typeof fetch;
  uuid?: () => string;
}) {
  const fetcher = input.fetcher ?? fetch;
  const uuid = input.uuid ?? (() => crypto.randomUUID());
  const idempotency = new IdempotencyRegistry(uuid);

  async function requestOnce<T>(
    path: string,
    options: ApiRequestOptions = {},
  ): Promise<ApiEnvelope<T>> {
    const method = options.method ?? "GET";
    const cleanPath = path.replace(/^\//, "");
    const url = `${organizationApiRoot(input.connection())}/${cleanPath}`;
    const mutation = method !== "GET";
    const fingerprint = mutationFingerprint(method, cleanPath, options.body);
    const idempotencyKey = mutation
      ? (options.idempotencyKey ?? idempotency.keyFor(fingerprint))
      : undefined;
    const token = input
      .token()
      .trim()
      .replace(/^Bearer\s+/i, "");
    let response: Response;
    try {
      response = await fetcher(url, {
        method,
        credentials: "same-origin",
        headers: {
          accept: "application/json",
          ...(options.body === undefined ? {} : { "content-type": "application/json" }),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          "x-correlation-id": options.correlationId ?? uuid(),
          ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
          ...(options.expectedVersion ? { "if-match": options.expectedVersion } : {}),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch (error) {
      throw new ApiClientError({
        status: 0,
        code: "NETWORK_ERROR",
        message: error instanceof Error ? error.message : "Network request failed",
      });
    }

    const payload = await parseJson(response);
    if (!response.ok) {
      const envelope = payload as { error?: ApiErrorBody; requestId?: string };
      throw new ApiClientError({
        status: response.status,
        code: envelope.error?.code,
        message: envelope.error?.message,
        details: envelope.error?.details,
        requestId: envelope.requestId,
      });
    }
    if (mutation) idempotency.complete(fingerprint);
    if (isApiEnvelope<T>(payload)) return payload;
    return { data: payload as T };
  }

  type Paged = {
    page?: { hasMore?: boolean; nextCursor?: string };
    meta?: Record<string, unknown>;
  };
  const MAX_AUTO_PAGES = 50;

  function withPagingParams(path: string, limit: number, cursor?: string): string {
    const qIndex = path.indexOf("?");
    const base = qIndex >= 0 ? path.slice(0, qIndex) : path;
    const params = new URLSearchParams(qIndex >= 0 ? path.slice(qIndex + 1) : "");
    params.set("limit", String(limit));
    if (cursor) params.set("cursor", cursor);
    else params.delete("cursor");
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }

  /**
   * Every list read is bounded by the server (BR-READ-001) and declares `page.hasMore`.
   * Unless the caller manages paging itself (`limit`/`cursor` in the path), follow `nextCursor` so
   * screens never mistake a first page for the whole list; hitting the cap is reported in meta.truncated.
   */
  async function request<T>(
    path: string,
    options: ApiRequestOptions = {},
  ): Promise<ApiEnvelope<T>> {
    const first = await requestOnce<T>(path, options);
    const selfPaged = /[?&](limit|cursor)=/.test(path);
    if ((options.method ?? "GET") !== "GET" || selfPaged) return first;
    let current = first as ApiEnvelope<T> & Paged;
    if (!current.page?.hasMore || !current.page.nextCursor) return first;
    const merged = first as ApiEnvelope<unknown> & Paged;
    for (let pages = 1; pages < MAX_AUTO_PAGES; pages += 1) {
      const cursor = current.page?.nextCursor;
      if (!current.page?.hasMore || !cursor) return merged as ApiEnvelope<T>;
      current = (await requestOnce<T>(
        withPagingParams(path, 200, cursor),
        options,
      )) as ApiEnvelope<T> & Paged;
      const data = merged.data as unknown[] | { items: unknown[] };
      const more = current.data as unknown[] | { items: unknown[] };
      if (Array.isArray(data) && Array.isArray(more)) data.push(...more);
      else if (!Array.isArray(data) && !Array.isArray(more)) data.items.push(...more.items);
      merged.page = current.page as Paged["page"];
      if (!Array.isArray(data)) {
        Object.assign(data, {
          hasMore: current.page?.hasMore,
          nextCursor: current.page?.nextCursor,
        });
      }
    }
    merged.meta = { ...merged.meta, truncated: true };
    return merged as ApiEnvelope<T>;
  }

  return Object.freeze({
    request,
    async data<T>(path: string, options?: ApiRequestOptions): Promise<T> {
      return (await request<T>(path, options)).data;
    },
    /**
     * Loads every page of a bounded list (BR-READ-001/002) by following `page.nextCursor`.
     * Safety cap keeps a runaway list from exhausting browser memory.
     */
    async dataAll<T>(path: string, options: { maxPages?: number } = {}): Promise<T[]> {
      const maxPages = options.maxPages ?? 50;
      const rows: T[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < maxPages; page += 1) {
        const url = withPagingParams(path, 200, cursor);
        const envelope = await request<T[] | { items?: T[]; nextCursor?: string }>(url);
        const data = envelope.data;
        if (Array.isArray(data)) {
          rows.push(...data);
          break;
        }
        rows.push(...(data.items ?? []));
        cursor = data.nextCursor;
        if (!cursor) break;
      }
      return rows;
    },
  });
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiClientError({
      status: response.status,
      code: "INVALID_JSON_RESPONSE",
      message: "API returned an invalid JSON response",
    });
  }
}
