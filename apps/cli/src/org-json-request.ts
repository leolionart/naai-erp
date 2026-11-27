import { randomUUID } from "node:crypto";

interface Options {
  baseUrl: string;
  organizationId?: string | undefined;
  token?: string | undefined;
}

/** Organization-scoped JSON request that throws the raw error body for non-2xx responses. */
export async function orgJsonRequest(
  options: Options,
  fetchFn: typeof fetch,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; idempotencyKey?: string } = { method: "GET" },
): Promise<unknown> {
  if (!options.organizationId || !options.token) throw new Error("ORGANIZATION_AND_TOKEN_REQUIRED");
  const response = await fetchFn(
    `${options.baseUrl}/api/v1/organizations/${encodeURIComponent(options.organizationId)}/${path}`,
    {
      method: init.method,
      headers: {
        authorization: `Bearer ${options.token.replace(/^Bearer\s+/i, "")}`,
        accept: "application/json",
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
        "x-correlation-id": randomUUID(),
        ...(init.idempotencyKey ? { "idempotency-key": init.idempotencyKey } : {}),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    },
  );
  return jsonOrThrow(response);
}

export async function jsonOrThrow(response: Response): Promise<unknown> {
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(body));
  return body;
}
