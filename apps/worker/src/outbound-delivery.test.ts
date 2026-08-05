import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  OutboundDeliveryRunner,
  classifyStatus,
  retryDelaySeconds,
  redactResponseSummary,
  signOutboundPayload,
  type DeliveryCompletion,
  type LeasedOutboundDelivery,
  type OutboundDeliveryStore,
} from "./outbound-delivery.js";

const delivery: LeasedOutboundDelivery = {
  organizationId: "org-1",
  deliveryId: "delivery-1",
  outboxEventId: "event-1",
  eventType: "expense.created",
  schemaVersion: 1,
  payload: { expenseId: "expense-1" },
  correlationId: "corr-1",
  occurredAt: "2026-08-05T10:00:00.000Z",
  endpointUrl: "https://example.test/webhook",
  secretRef: "OUTBOUND_SECRET",
  attemptNumber: 1,
  maxAttempts: 3,
  timeoutSeconds: 5,
  baseDelaySeconds: 30,
  maxDelaySeconds: 3600,
};

function fakeStore() {
  const completions: DeliveryCompletion[] = [];
  const store: OutboundDeliveryStore = {
    materializePending: vi.fn(async () => 1),
    releaseExpiredLeases: vi.fn(async () => 0),
    leaseDue: vi.fn(async () => [delivery]),
    complete: vi.fn(async (_delivery, _worker, completion) => {
      completions.push(completion);
    }),
  };
  return { store, completions };
}

describe("ERP-340 outbound delivery", () => {
  it("signs the exact versioned body and marks a 2xx attempt delivered", async () => {
    const { store, completions } = fakeStore();
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => ({
      status: 204,
      text: async () => "",
      request: init,
    }));
    const now = () => new Date("2026-08-05T10:00:00.000Z");
    const runner = new OutboundDeliveryRunner(store, fetcher, () => "secret", "worker-1", now);
    const result = await runner.runBatch();
    const init = fetcher.mock.calls[0]?.[1];
    const raw = String(init?.body);
    const timestamp = "1785924000";
    expect(init?.headers).toMatchObject({
      "x-naai-event-id": "event-1",
      "x-naai-schema-version": "1",
      "x-naai-timestamp": timestamp,
      "x-naai-signature": `sha256=${createHmac("sha256", "secret").update(`${timestamp}.${raw}`).digest("hex")}`,
    });
    expect(completions).toEqual([{ outcome: "delivered", httpStatus: 204, responseSummary: "" }]);
    expect(result.delivered).toBe(1);
  });

  it("retries transient failures with bounded exponential backoff", async () => {
    const { store, completions } = fakeStore();
    const runner = new OutboundDeliveryRunner(
      store,
      async () => ({ status: 503, text: async () => "temporarily unavailable" }),
      () => "secret",
      "worker-1",
      () => new Date("2026-08-05T10:00:00.000Z"),
    );
    await runner.runBatch();
    expect(completions[0]).toMatchObject({
      outcome: "retryable_failure",
      httpStatus: 503,
      nextRetryAt: new Date("2026-08-05T10:00:30.000Z"),
    });
  });

  it("treats exhausted and permanent failures as dead-letter candidates", async () => {
    const { store, completions } = fakeStore();
    const runner = new OutboundDeliveryRunner(
      { ...store, leaseDue: async () => [{ ...delivery, attemptNumber: 3 }] },
      async () => ({ status: 400, text: async () => "invalid" }),
      () => "secret",
      "worker-1",
    );
    await runner.runBatch();
    expect(completions[0]).toEqual({
      outcome: "permanent_failure",
      httpStatus: 400,
      responseSummary: "invalid",
    });
  });

  it("classifies status codes and caps delay", () => {
    expect(classifyStatus(429)).toBe("retryable_failure");
    expect(classifyStatus(422)).toBe("permanent_failure");
    expect(signOutboundPayload("s", "1", "{}")).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(retryDelaySeconds(20, 30, 3600)).toBe(3600);
    expect(redactResponseSummary('{"token":"abc","message":"failed"}')).toContain(
      '"token":"[REDACTED]"',
    );
  });
});
