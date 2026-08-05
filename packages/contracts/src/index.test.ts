import { describe, expect, it } from "vitest";
import { API_VERSION, type ApiEnvelope, type MutationMetadata } from "./index.js";

describe("AI-native API contracts", () => {
  it("keeps organization and request context in envelopes", () => {
    const response: ApiEnvelope<{ id: string }> = {
      apiVersion: API_VERSION,
      requestId: "req-1",
      organizationId: "org-naai",
      data: { id: "party-1" },
    };
    expect(response.apiVersion).toBe("v1");
  });

  it("returns audit and next-action mutation metadata", () => {
    const metadata: MutationMetadata = {
      resourceVersion: "3",
      auditEventId: "audit-1",
      correlationId: "corr-1",
      idempotencyReplayed: false,
      nextActions: ["submit"],
    };
    expect(metadata.nextActions).toEqual(["submit"]);
  });
});
