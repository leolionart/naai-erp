export type InboundEnvelope = Readonly<{
  schemaVersion: number;
  eventType: "sales_invoice.create" | "purchase_invoice.create" | "expense.create";
  externalId: string;
  occurredAt: string;
  data: Readonly<Record<string, unknown>>;
}>;

export const INBOUND_SCHEMA_VERSION = 1;
export const INBOUND_REPLAY_WINDOW_SECONDS = 300;

export function validateInboundTimestamp(
  timestamp: string,
  nowSeconds: number,
  windowSeconds = INBOUND_REPLAY_WINDOW_SECONDS,
) {
  if (!/^\d+$/.test(timestamp)) throw new Error("WEBHOOK_TIMESTAMP_INVALID");
  const received = Number(timestamp);
  if (!Number.isSafeInteger(received) || Math.abs(nowSeconds - received) > windowSeconds)
    throw new Error("WEBHOOK_TIMESTAMP_OUTSIDE_WINDOW");
  return received;
}

export function validateInboundEnvelope(value: unknown): InboundEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("WEBHOOK_SCHEMA_INVALID");
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== INBOUND_SCHEMA_VERSION) throw new Error("WEBHOOK_SCHEMA_UNSUPPORTED");
  if (
    !["sales_invoice.create", "purchase_invoice.create", "expense.create"].includes(
      String(input.eventType),
    )
  )
    throw new Error("WEBHOOK_EVENT_UNMAPPED");
  if (
    typeof input.externalId !== "string" ||
    !input.externalId.trim() ||
    input.externalId.length > 200
  )
    throw new Error("WEBHOOK_SCHEMA_INVALID");
  if (typeof input.occurredAt !== "string" || Number.isNaN(Date.parse(input.occurredAt)))
    throw new Error("WEBHOOK_SCHEMA_INVALID");
  if (!input.data || typeof input.data !== "object" || Array.isArray(input.data))
    throw new Error("WEBHOOK_SCHEMA_INVALID");
  if (containsUnsafeKey(input.data)) throw new Error("WEBHOOK_SCHEMA_INVALID");
  return input as InboundEnvelope;
}

export function inboundRetryDelaySeconds(attempt: number) {
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error("VALIDATION_FAILED");
  return Math.min(3600, 30 * 2 ** (attempt - 1));
}

function containsUnsafeKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsUnsafeKey);
  return Object.entries(value).some(
    ([key, child]) =>
      ["__proto__", "prototype", "constructor"].includes(key) || containsUnsafeKey(child),
  );
}
