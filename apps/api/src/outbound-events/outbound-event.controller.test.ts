import { describe, expect, it, vi } from "vitest";
import { OutboundEventController } from "./outbound-event.controller.js";

describe("ERP-340 outbound event admin controller", () => {
  it("passes validated outbox filters through an organization-scoped context", async () => {
    const service = {
      authenticate: vi.fn().mockResolvedValue({
        organizationId: "org-a",
        actorId: "viewer-a",
        roles: ["viewer"],
        correlationId: "corr-a",
      }),
      listOutbox: vi.fn().mockResolvedValue({ data: { items: [] } }),
    };
    const controller = new OutboundEventController(service as never);
    await controller.listOutbox(
      "org-a",
      "dead_letter",
      "expense.posted",
      "expense",
      "expense-1",
      "cursor-1",
      "50",
      "Bearer token",
      "corr-a",
    );
    expect(service.listOutbox).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-a" }),
      {
        state: "dead_letter",
        eventType: "expense.posted",
        aggregateType: "expense",
        aggregateId: "expense-1",
        cursor: "cursor-1",
        limit: 50,
      },
    );
  });

  it("forwards replay reason and stable idempotency key", async () => {
    const service = {
      authenticate: vi.fn().mockResolvedValue({
        organizationId: "org-a",
        actorId: "finance-a",
        roles: ["finance_admin"],
        correlationId: "corr-a",
      }),
      replay: vi.fn().mockResolvedValue({ data: { state: "pending" } }),
    };
    const controller = new OutboundEventController(service as never);
    await controller.replay(
      "org-a",
      "event-1",
      { reason: "Endpoint recovered" },
      "Bearer token",
      "corr-a",
      "replay-key",
    );
    expect(service.replay).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-a" }),
      "event-1",
      { reason: "Endpoint recovered" },
      "replay-key",
    );
  });

  it("rejects invalid page sizes before querying the store", async () => {
    const service = { authenticate: vi.fn(), listDeliveries: vi.fn() };
    const controller = new OutboundEventController(service as never);
    await expect(
      controller.listDeliveries("org-a", undefined, undefined, undefined, undefined, "500"),
    ).rejects.toThrow("VALIDATION_FAILED");
    expect(service.authenticate).not.toHaveBeenCalled();
  });
});
