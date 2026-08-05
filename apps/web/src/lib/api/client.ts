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

  async function request<T>(
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

  return Object.freeze({
    request,
    async data<T>(path: string, options?: ApiRequestOptions): Promise<T> {
      return (await request<T>(path, options)).data;
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
