import { writeFile } from "node:fs/promises";

// BR-READ-006: bounded list reads, an stdout budget and file output for large results.
export const DEFAULT_MAX_BYTES = 200_000;
export const DEFAULT_MAX_RECORDS = 5_000;
const PAGED_RESOURCES = new Set(["expenses", "commercial-documents", "journals"]);

export const LIST_OPTIONS = {
  view: { type: "string" },
  q: { type: "string" },
  sort: { type: "string" },
  "max-bytes": { type: "string" },
  "max-records": { type: "string" },
  "include-total": { type: "boolean" },
  all: { type: "boolean" },
} as const;

type Values = Record<string, string | boolean | string[] | undefined>;

export function withListPaging(resource: string, action: string, payload: unknown, values: Values) {
  if (!PAGED_RESOURCES.has(resource) || action !== "list") return payload;
  const extra: Record<string, unknown> = {};
  for (const [flag, name] of [
    ["limit", "limit"],
    ["cursor", "cursor"],
    ["view", "view"],
    ["q", "q"],
    ["sort", "sort"],
    ["state", "state"],
  ] as const) {
    if (values[flag]) extra[name] = values[flag];
  }
  if (values["include-total"]) extra.includeTotal = "true";
  return { ...(payload && typeof payload === "object" ? payload : {}), ...extra };
}

function maxBytes(values: Values, env = process.env): number {
  const raw = Number.parseInt(String(values["max-bytes"] ?? env.NAAI_ERP_MAX_BYTES ?? ""), 10);
  return Number.isFinite(raw) && raw > 1_000 ? raw : DEFAULT_MAX_BYTES;
}

/** Serializes a result within the stdout budget; always valid JSON, cut on record boundaries. */
export function renderOutput(result: unknown, values: Values): { text: string; hint?: string } {
  const pretty = Boolean(values.human);
  const render = (value: unknown) => `${JSON.stringify(value, null, pretty ? 2 : undefined)}\n`;
  const budget = maxBytes(values);
  let text = render(result);
  if (Buffer.byteLength(text) <= budget || !result || typeof result !== "object") return { text };
  const envelope = result as { data?: unknown; meta?: Record<string, unknown> };
  const container = envelope.data as { items?: unknown[] } | unknown[] | undefined;
  const items = Array.isArray(container) ? container : container?.items;
  if (!Array.isArray(items)) return { text };
  let keep = items.length;
  const build = (count: number) => {
    const cut = items.slice(0, count);
    const data = Array.isArray(container) ? cut : { ...container, items: cut, hasMore: true };
    return {
      ...envelope,
      data,
      meta: { ...envelope.meta, count, truncated: true, bytes: Buffer.byteLength(render(data)) },
    };
  };
  while (keep > 1) {
    keep = Math.max(1, Math.floor(keep / 2));
    text = render(build(keep));
    if (Buffer.byteLength(text) <= budget) break;
  }
  return {
    text,
    hint: `Output exceeded ${budget} bytes and was cut at ${keep} records. Narrow with --state/--q, lower --limit, use --view summary, or write everything to a file with --all --output <path>.`,
  };
}

interface ListClient {
  request(
    resource: string,
    action: string,
    payload?: unknown,
    key?: string,
    version?: string,
    idempotencyKey?: string,
  ): Promise<unknown>;
}

/** `--all --output file`: walks nextCursor and writes NDJSON (or CSV) without touching stdout. */
export async function listAllToFile(
  client: ListClient,
  resource: string,
  payload: unknown,
  values: Values,
) {
  const output = values.output;
  if (typeof output !== "string" || !output) throw new Error("--all requires --output <path>");
  const limit = Number.parseInt(String(values["max-records"] ?? ""), 10);
  const maxRecords = Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_MAX_RECORDS;
  const csv = values.format === "csv";
  const lines: string[] = [];
  let records = 0;
  let cursor: string | undefined;
  let columns: string[] = [];
  let nextCursor: string | undefined;
  while (records < maxRecords) {
    const result = (await client.request(resource, "list", {
      ...(payload as object),
      limit: 100,
      ...(cursor ? { cursor } : {}),
    })) as { data?: { items?: Record<string, unknown>[]; nextCursor?: string } };
    const items = result.data?.items ?? [];
    for (const item of items) {
      if (records >= maxRecords) break;
      if (csv) {
        if (columns.length === 0) {
          columns = Object.keys(item);
          lines.push(columns.join(","));
        }
        lines.push(columns.map((column) => JSON.stringify(item[column] ?? "")).join(","));
      } else {
        lines.push(JSON.stringify(item));
      }
      records += 1;
    }
    nextCursor = result.data?.nextCursor;
    if (!nextCursor || items.length === 0) break;
    cursor = nextCursor;
  }
  const body = `${lines.join("\n")}\n`;
  await writeFile(output, body);
  return {
    file: output,
    records,
    bytes: Buffer.byteLength(body),
    ...(nextCursor && records >= maxRecords ? { nextCursor } : {}),
  };
}

/** Single entry used by the CLI: merges list options, then either streams to a file or requests once. */
export async function executeRequest(
  client: ListClient,
  resource: string,
  action: string,
  payload: unknown,
  values: Values,
) {
  const paged = withListPaging(resource, action, payload, values);
  if (values.all && action === "list") return listAllToFile(client, resource, paged, values);
  return client.request(
    resource,
    action,
    paged,
    values.key as string | undefined,
    (values["snapshot-version"] ?? values.version) as string | undefined,
    values["idempotency-key"] as string | undefined,
  );
}
