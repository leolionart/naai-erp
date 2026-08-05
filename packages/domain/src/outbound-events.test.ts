import { describe, expect, it } from "vitest";
import {
  assertSupportedOutboundEventVersion,
  beginOutboundDelivery,
  calculateOutboundFailureDecision,
  completeOutboundDelivery,
  createOutboundDelivery,
  createOutboundEvent,
  failOutboundDelivery,
  replayDeadLetter,
} from "./outbound-events.js";

function event(overrides: Partial<Parameters<typeof createOutboundEvent>[0]> = {}) {
  return createOutboundEvent({
    id: "event-1",
    organizationId: "org-naai",
    eventType: "sales_invoice.issued",
    schemaVersion: 1,
    aggregateType: "sales_invoice",
    aggregateId: "invoice-1",
    occurredAt: "2026-08-05T10:00:00.000Z",
    correlationId: "corr-1",
    payload: { invoiceId: "invoice-1", grossMinor: "110000000" },
    ...overrides,
  });
}

const retryPolicy = { maxAttempts: 4, baseDelayMs: 1_000, maxDelayMs: 2_500 } as const;

describe("ERP-340 outbound event contracts", () => {
  it("creates an immutable schema-versioned JSON event", () => {
    const outbound = event();
    expect(outbound).toMatchObject({
      eventType: "sales_invoice.issued",
      schemaVersion: 1,
      payload: { grossMinor: "110000000" },
    });
    expect(Object.isFrozen(outbound)).toBe(true);
    expect(Object.isFrozen(outbound.payload)).toBe(true);
    expect(() =>
      assertSupportedOutboundEventVersion(outbound, { "sales_invoice.issued": [1] }),
    ).not.toThrow();
    expect(() =>
      assertSupportedOutboundEventVersion(outbound, { "sales_invoice.issued": [2] }),
    ).toThrow("Unsupported outbound contract");
  });

  it("rejects invalid names, versions and non-deterministic JSON values", () => {
    expect(() => event({ schemaVersion: 0 })).toThrow("positive integer");
    expect(() => event({ eventType: "Invoice Issued" })).toThrow("contract name");
    expect(() => event({ payload: { amount: Number.NaN } })).toThrow("finite safe integers");
    expect(() => event({ payload: { amount: Number.MAX_SAFE_INTEGER + 1 } })).toThrow(
      "finite safe integers",
    );
    expect(() => event({ payload: { date: new Date() } as never })).toThrow("plain JSON objects");
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => event({ payload: circular as never })).toThrow("circular references");
  });
});

describe("ERP-340 deterministic delivery workflow", () => {
  it("delivers only through pending to delivering to delivered", () => {
    const pending = createOutboundDelivery(event());
    const delivering = beginOutboundDelivery(pending, "2026-08-05T10:01:00.000Z");
    const delivered = completeOutboundDelivery(delivering, "2026-08-05T10:01:01.000Z");
    expect(delivering).toMatchObject({ state: "delivering", attemptCount: 1 });
    expect(delivered).toMatchObject({ state: "delivered", attemptCount: 1 });
    expect(() => beginOutboundDelivery(delivered, "2026-08-05T10:02:00.000Z")).toThrow(
      "Cannot begin",
    );
    expect(() => completeOutboundDelivery(pending, "2026-08-05T10:02:00.000Z")).toThrow(
      "active attempt",
    );
  });

  it("uses deterministic capped exponential delays", () => {
    expect(
      calculateOutboundFailureDecision({
        attemptCount: 1,
        failedAt: "2026-08-05T10:00:00Z",
        policy: retryPolicy,
      }),
    ).toEqual({
      state: "retry_scheduled",
      delayMs: 1_000,
      nextAttemptAt: "2026-08-05T10:00:01.000Z",
    });
    expect(
      calculateOutboundFailureDecision({
        attemptCount: 2,
        failedAt: "2026-08-05T10:00:00Z",
        policy: retryPolicy,
      }),
    ).toEqual({
      state: "retry_scheduled",
      delayMs: 2_000,
      nextAttemptAt: "2026-08-05T10:00:02.000Z",
    });
    expect(
      calculateOutboundFailureDecision({
        attemptCount: 3,
        failedAt: "2026-08-05T10:00:00Z",
        policy: retryPolicy,
      }),
    ).toEqual({
      state: "retry_scheduled",
      delayMs: 2_500,
      nextAttemptAt: "2026-08-05T10:00:02.500Z",
    });
    expect(
      calculateOutboundFailureDecision({
        attemptCount: 4,
        failedAt: "2026-08-05T10:00:00Z",
        policy: retryPolicy,
      }),
    ).toEqual({ state: "dead_letter" });
  });

  it("blocks early retry, dead-letters at max attempts and requires audited replay", () => {
    let delivery = beginOutboundDelivery(createOutboundDelivery(event()), "2026-08-05T10:00:00Z");
    delivery = failOutboundDelivery(delivery, {
      failedAt: "2026-08-05T10:00:01Z",
      failureCode: "HTTP_503",
      policy: { ...retryPolicy, maxAttempts: 2 },
    });
    expect(delivery).toMatchObject({
      state: "retry_scheduled",
      attemptCount: 1,
      nextAttemptAt: "2026-08-05T10:00:02.000Z",
    });
    expect(() => beginOutboundDelivery(delivery, "2026-08-05T10:00:01.999Z")).toThrow(
      "not due yet",
    );
    delivery = beginOutboundDelivery(delivery, "2026-08-05T10:00:02Z");
    delivery = failOutboundDelivery(delivery, {
      failedAt: "2026-08-05T10:00:03Z",
      failureCode: "TIMEOUT",
      policy: { ...retryPolicy, maxAttempts: 2 },
    });
    expect(delivery).toMatchObject({
      state: "dead_letter",
      attemptCount: 2,
      lastFailureCode: "TIMEOUT",
    });
    const replayed = replayDeadLetter(delivery, {
      actorId: "finance-admin",
      reason: "Endpoint recovered",
      replayedAt: "2026-08-05T11:00:00Z",
    });
    expect(replayed).toMatchObject({
      state: "pending",
      attemptCount: 0,
      replayedBy: "finance-admin",
      replayReason: "Endpoint recovered",
    });
    expect(beginOutboundDelivery(replayed, "2026-08-05T11:00:01Z").attemptCount).toBe(1);
    expect(() =>
      replayDeadLetter(replayed, {
        actorId: "finance-admin",
        reason: "Again",
        replayedAt: "2026-08-05T11:01:00Z",
      }),
    ).toThrow("Only dead-letter");
  });

  it("rejects invalid retry policies and failures outside an active attempt", () => {
    expect(() =>
      calculateOutboundFailureDecision({
        attemptCount: 1,
        failedAt: "2026-08-05T10:00:00Z",
        policy: { maxAttempts: 0, baseDelayMs: 1, maxDelayMs: 1 },
      }),
    ).toThrow("positive integer");
    expect(() =>
      failOutboundDelivery(createOutboundDelivery(event()), {
        failedAt: "2026-08-05T10:00:00Z",
        failureCode: "HTTP_500",
        policy: retryPolicy,
      }),
    ).toThrow("active attempt");
  });
});
