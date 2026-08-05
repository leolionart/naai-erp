import { describe, expect, it } from "vitest";
import {
  inboundRetryDelaySeconds,
  validateInboundEnvelope,
  validateInboundTimestamp,
} from "./inbound-webhooks.js";

describe("ERP-330 inbound webhook domain", () => {
  it("enforces the timestamp replay window", () => {
    expect(validateInboundTimestamp("1000", 1299)).toBe(1000);
    expect(() => validateInboundTimestamp("1000", 1301)).toThrow(
      "WEBHOOK_TIMESTAMP_OUTSIDE_WINDOW",
    );
    expect(() => validateInboundTimestamp("not-a-time", 1000)).toThrow("WEBHOOK_TIMESTAMP_INVALID");
  });
  it("accepts only explicit schema and event versions", () => {
    expect(
      validateInboundEnvelope({
        schemaVersion: 1,
        eventType: "expense.create",
        externalId: "ext-1",
        occurredAt: "2026-08-05T10:00:00Z",
        data: { id: "expense-1" },
      }),
    ).toMatchObject({ externalId: "ext-1" });
    expect(() =>
      validateInboundEnvelope({
        schemaVersion: 2,
        eventType: "expense.create",
        externalId: "ext",
        occurredAt: "2026-08-05T10:00:00Z",
        data: {},
      }),
    ).toThrow("WEBHOOK_SCHEMA_UNSUPPORTED");
    expect(() =>
      validateInboundEnvelope({
        schemaVersion: 1,
        eventType: "journal.post",
        externalId: "ext",
        occurredAt: "2026-08-05T10:00:00Z",
        data: {},
      }),
    ).toThrow("WEBHOOK_EVENT_UNMAPPED");
  });
  it("uses bounded exponential retry delays", () => {
    expect([1, 2, 3, 8].map(inboundRetryDelaySeconds)).toEqual([30, 60, 120, 3600]);
  });
});
