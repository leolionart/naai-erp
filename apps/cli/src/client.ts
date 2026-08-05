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
    const isJournal = resource === "journals";
    const isPostingRule = resource === "posting-rules";
    const base = `${this.options.baseUrl}/api/v1/organizations/${encodeURIComponent(this.options.organizationId)}/${isJournal ? "journals" : isPostingRule ? "posting-rules" : `master-data/${encodeURIComponent(resource)}`}`;
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
          : isJournal && action === "post"
            ? `${base}/${key}/post`
            : isPostingRule && action === "evaluate"
              ? `${base}/evaluate`
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
