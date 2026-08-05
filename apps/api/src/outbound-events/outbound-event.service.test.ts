import { describe, expect, it, vi } from "vitest";
import { OutboundEventService } from "./outbound-event.service.js";

const context = {
  organizationId: "org-a",
  actorId: "finance-a",
  roles: ["finance_admin"],
  correlationId: "corr-a",
};

function service() {
  const store = {
    listEndpoints: vi.fn().mockResolvedValue({ items: [] }),
    getEndpoint: vi.fn().mockResolvedValue({ id: "endpoint-1" }),
    createEndpoint: vi.fn().mockResolvedValue({ id: "endpoint-1" }),
    updateEndpoint: vi.fn().mockResolvedValue({ id: "endpoint-1", version: "2" }),
    listOutbox: vi.fn().mockResolvedValue({ items: [] }),
    getOutboxEvent: vi.fn().mockResolvedValue({ id: "event-1", state: "dead_letter" }),
    listDeliveries: vi.fn().mockResolvedValue({ items: [] }),
    getDelivery: vi.fn().mockResolvedValue({ id: "delivery-1" }),
    replay: vi.fn().mockResolvedValue({
      outboxEventId: "event-1",
      state: "pending",
      resourceVersion: "2",
      auditEventId: "audit-1",
      idempotencyReplayed: false,
      nextActions: ["get"],
    }),
  };
  const master = { authenticate: vi.fn() };
  return { store, subject: new OutboundEventService(store, master as never) };
}

describe("ERP-340 outbound event admin service", () => {
  it("creates endpoint configuration only for privileged roles and public HTTPS targets", async () => {
    const { subject, store } = service();
    const input = {
      name: "Accounting sink",
      endpointUrl: "https://events.example.com/naai",
      eventTypes: ["journal.posted"],
      secretRef: "OUTBOUND_ACCOUNTING_SECRET",
    };
    await subject.createEndpoint(context, input, "endpoint-create-key");
    expect(store.createEndpoint).toHaveBeenCalledWith(context, input, "endpoint-create-key");
    await expect(
      subject.createEndpoint({ ...context, roles: ["viewer"] }, input, "key"),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      subject.createEndpoint(
        context,
        { ...input, endpointUrl: "https://127.0.0.1/internal" },
        "private-key",
      ),
    ).rejects.toThrow("OUTBOUND_ENDPOINT_INVALID");
  });

  it("returns organization-scoped outbox data in the API envelope", async () => {
    const { subject, store } = service();
    const result = await subject.listOutbox(context, { state: "dead_letter" });
    expect(store.listOutbox).toHaveBeenCalledWith("org-a", { state: "dead_letter" });
    expect(result).toMatchObject({ apiVersion: "v1", organizationId: "org-a" });
  });

  it("requires privileged role, reason and idempotency for replay", async () => {
    const { subject, store } = service();
    await expect(
      subject.replay({ ...context, roles: ["viewer"] }, "event-1", { reason: "Retry" }, "key"),
    ).rejects.toThrow("FORBIDDEN");
    await expect(subject.replay(context, "event-1", { reason: "Retry" })).rejects.toThrow(
      "IDEMPOTENCY_KEY_REQUIRED",
    );
    await expect(subject.replay(context, "event-1", { reason: " " }, "key")).rejects.toThrow(
      "VALIDATION_FAILED",
    );
    expect(store.replay).not.toHaveBeenCalled();
  });

  it("delegates an audited idempotent replay to the persistence adapter", async () => {
    const { subject, store } = service();
    const result = await subject.replay(
      context,
      "event-1",
      { reason: "Endpoint recovered", endpointId: " endpoint-1 " },
      "stable-key",
    );
    expect(store.replay).toHaveBeenCalledWith(
      context,
      "event-1",
      { reason: "Endpoint recovered", endpointId: "endpoint-1" },
      "stable-key",
    );
    expect(result.data).toMatchObject({ auditEventId: "audit-1", idempotencyReplayed: false });
  });
});
