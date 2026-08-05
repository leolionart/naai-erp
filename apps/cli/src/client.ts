import { randomUUID } from "node:crypto";

export type CliOptions = Readonly<{
  baseUrl: string;
  organizationId: string;
  token: string;
}>;

export class NaaiErpClient {
  constructor(
    private readonly options: CliOptions,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  request(
    resource: string,
    action: string,
    payload?: unknown,
    key?: string,
    expectedVersion?: string,
  ): Promise<unknown> {
    const base = `${this.options.baseUrl}/api/v1/organizations/${encodeURIComponent(this.options.organizationId)}/master-data/${encodeURIComponent(resource)}`;
    const method =
      action === "list" || action === "get" || action === "export"
        ? "GET"
        : action === "update"
          ? "PATCH"
          : "POST";
    const url =
      action === "list"
        ? base
        : action === "get" || action === "update"
          ? `${base}/${key}`
          : action === "deactivate"
            ? `${base}/${key}/deactivate`
            : action === "import"
              ? `${base}/import/dry-run`
              : action === "export"
                ? `${base}/export`
                : base;
    const correlationId = randomUUID();
    return this.fetchFn(url, {
      method,
      headers: {
        authorization: `Bearer ${this.options.token}`,
        "content-type": "application/json",
        "x-correlation-id": correlationId,
        ...(method !== "GET" ? { "idempotency-key": randomUUID() } : {}),
        ...(expectedVersion ? { "if-match": expectedVersion } : {}),
      },
      ...(method !== "GET" ? { body: JSON.stringify(payload ?? { data: {} }) } : {}),
    }).then(async (response) => {
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(body));
      return body;
    });
  }
}
