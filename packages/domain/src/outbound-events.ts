export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}
export type JsonArray = readonly JsonValue[];

export type OutboundEventContract = Readonly<{
  id: string;
  organizationId: string;
  eventType: string;
  schemaVersion: number;
  aggregateType: string;
  aggregateId: string;
  occurredAt: string;
  correlationId: string;
  payload: JsonObject;
}>;

export type OutboundDeliveryState =
  "pending" | "delivering" | "retry_scheduled" | "delivered" | "dead_letter";

export type OutboundDelivery = Readonly<{
  event: OutboundEventContract;
  state: OutboundDeliveryState;
  attemptCount: number;
  nextAttemptAt?: string;
  deliveredAt?: string;
  lastFailureCode?: string;
  replayedAt?: string;
  replayedBy?: string;
  replayReason?: string;
}>;

export type OutboundBackoffPolicy = Readonly<{
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}>;

export type OutboundFailureDecision = Readonly<{
  state: "retry_scheduled" | "dead_letter";
  delayMs?: number;
  nextAttemptAt?: string;
}>;

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function timestamp(value: string, label: string): string {
  if (!value.trim() || Number.isNaN(Date.parse(value))) throw new Error(`${label} must be valid`);
  return value;
}

function validateJson(value: unknown, path: string, seen: Set<object>): asserts value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
      throw new Error(`${path} numbers must be finite safe integers`);
    }
    return;
  }
  if (typeof value !== "object") throw new Error(`${path} must contain JSON values only`);
  if (seen.has(value)) throw new Error(`${path} must not contain circular references`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateJson(item, `${path}[${index}]`, seen));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${path} must contain plain JSON objects only`);
    }
    for (const [key, item] of Object.entries(value)) {
      if (!key.trim()) throw new Error(`${path} keys must not be blank`);
      validateJson(item, `${path}.${key}`, seen);
    }
  }
  seen.delete(value);
}

function freezeJson<T extends JsonValue>(value: T): T {
  if (value && typeof value === "object") {
    if (Array.isArray(value)) value.forEach((item: JsonValue) => freezeJson(item));
    else Object.values(value).forEach((item) => freezeJson(item));
    Object.freeze(value);
  }
  return value;
}

function immutableDelivery(delivery: OutboundDelivery): OutboundDelivery {
  return Object.freeze({ ...delivery });
}

function policy(input: OutboundBackoffPolicy): OutboundBackoffPolicy {
  if (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1) {
    throw new Error("Maximum delivery attempts must be a positive integer");
  }
  if (!Number.isSafeInteger(input.baseDelayMs) || input.baseDelayMs < 1) {
    throw new Error("Base delay must be a positive safe integer");
  }
  if (!Number.isSafeInteger(input.maxDelayMs) || input.maxDelayMs < input.baseDelayMs) {
    throw new Error("Maximum delay must be a safe integer not below base delay");
  }
  return input;
}

export function createOutboundEvent(input: OutboundEventContract): OutboundEventContract {
  if (!Number.isInteger(input.schemaVersion) || input.schemaVersion < 1) {
    throw new Error("Outbound event schema version must be a positive integer");
  }
  const eventType = required(input.eventType, "Event type");
  if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(eventType)) {
    throw new Error("Event type must be a versioned-contract name such as invoice.issued");
  }
  validateJson(input.payload, "Payload", new Set());
  return Object.freeze({
    id: required(input.id, "Event ID"),
    organizationId: required(input.organizationId, "Organization ID"),
    eventType,
    schemaVersion: input.schemaVersion,
    aggregateType: required(input.aggregateType, "Aggregate type"),
    aggregateId: required(input.aggregateId, "Aggregate ID"),
    occurredAt: timestamp(input.occurredAt, "Occurred-at timestamp"),
    correlationId: required(input.correlationId, "Correlation ID"),
    payload: freezeJson(input.payload),
  });
}

export function assertSupportedOutboundEventVersion(
  event: OutboundEventContract,
  supportedVersions: Readonly<Record<string, readonly number[]>>,
): void {
  const versions = supportedVersions[event.eventType];
  if (!versions?.includes(event.schemaVersion)) {
    throw new Error(`Unsupported outbound contract: ${event.eventType} v${event.schemaVersion}`);
  }
}

export function createOutboundDelivery(event: OutboundEventContract): OutboundDelivery {
  return immutableDelivery({
    event: createOutboundEvent(event),
    state: "pending",
    attemptCount: 0,
  });
}

export function calculateOutboundFailureDecision(input: {
  attemptCount: number;
  failedAt: string;
  policy: OutboundBackoffPolicy;
}): OutboundFailureDecision {
  const checked = policy(input.policy);
  if (!Number.isInteger(input.attemptCount) || input.attemptCount < 1) {
    throw new Error("Failure decision requires a started delivery attempt");
  }
  const failedAt = timestamp(input.failedAt, "Failure timestamp");
  if (input.attemptCount >= checked.maxAttempts) return Object.freeze({ state: "dead_letter" });
  const exponent = Math.min(input.attemptCount - 1, 52);
  const delayMs = Math.min(checked.maxDelayMs, checked.baseDelayMs * 2 ** exponent);
  const safeDelayMs = Number.isSafeInteger(delayMs) ? delayMs : checked.maxDelayMs;
  return Object.freeze({
    state: "retry_scheduled",
    delayMs: safeDelayMs,
    nextAttemptAt: new Date(Date.parse(failedAt) + safeDelayMs).toISOString(),
  });
}

export function beginOutboundDelivery(
  delivery: OutboundDelivery,
  attemptedAt: string,
): OutboundDelivery {
  const at = timestamp(attemptedAt, "Attempt timestamp");
  if (delivery.state !== "pending" && delivery.state !== "retry_scheduled") {
    throw new Error(`Cannot begin delivery from ${delivery.state}`);
  }
  if (
    delivery.state === "retry_scheduled" &&
    delivery.nextAttemptAt &&
    Date.parse(at) < Date.parse(delivery.nextAttemptAt)
  ) {
    throw new Error("Scheduled retry is not due yet");
  }
  return immutableDelivery({
    event: delivery.event,
    state: "delivering",
    attemptCount: delivery.attemptCount + 1,
  });
}

export function completeOutboundDelivery(
  delivery: OutboundDelivery,
  deliveredAt: string,
): OutboundDelivery {
  if (delivery.state !== "delivering") throw new Error("Only an active attempt can be delivered");
  return immutableDelivery({
    event: delivery.event,
    state: "delivered",
    attemptCount: delivery.attemptCount,
    deliveredAt: timestamp(deliveredAt, "Delivery timestamp"),
  });
}

export function failOutboundDelivery(
  delivery: OutboundDelivery,
  input: { failedAt: string; failureCode: string; policy: OutboundBackoffPolicy },
): OutboundDelivery {
  if (delivery.state !== "delivering") throw new Error("Only an active attempt can fail");
  const decision = calculateOutboundFailureDecision({
    attemptCount: delivery.attemptCount,
    failedAt: input.failedAt,
    policy: input.policy,
  });
  return immutableDelivery({
    event: delivery.event,
    state: decision.state,
    attemptCount: delivery.attemptCount,
    lastFailureCode: required(input.failureCode, "Failure code"),
    ...(decision.nextAttemptAt ? { nextAttemptAt: decision.nextAttemptAt } : {}),
  });
}

export function replayDeadLetter(
  delivery: OutboundDelivery,
  input: { actorId: string; reason: string; replayedAt: string },
): OutboundDelivery {
  if (delivery.state !== "dead_letter")
    throw new Error("Only dead-letter delivery can be replayed");
  return immutableDelivery({
    event: delivery.event,
    state: "pending",
    attemptCount: 0,
    replayedBy: required(input.actorId, "Replay actor"),
    replayReason: required(input.reason, "Replay reason"),
    replayedAt: timestamp(input.replayedAt, "Replay timestamp"),
  });
}
