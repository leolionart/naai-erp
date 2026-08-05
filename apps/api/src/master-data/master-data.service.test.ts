import { describe, expect, it, vi } from "vitest";
import { MasterDataService } from "./master-data.service.js";

function serviceWithStore(overrides: Record<string, unknown> = {}) {
  const store = {
    authenticate: vi.fn().mockResolvedValue({ actorId: "ai-1", roles: ["integration"] }),
    list: vi.fn().mockResolvedValue([{ id: "p1" }]),
    get: vi.fn().mockResolvedValue({ id: "p1" }),
    mutate: vi.fn().mockResolvedValue({
      data: { id: "p1" },
      resourceVersion: "1",
      auditEventId: "a1",
      idempotencyReplayed: false,
      nextActions: ["update"],
    }),
    ...overrides,
  };
  return { service: new MasterDataService(store as never), store };
}

describe("AI-native master data service", () => {
  it("requires bearer authentication and organization-scoped credentials", async () => {
    const { service } = serviceWithStore();
    await expect(service.authenticate(undefined, "org-a", "corr-1")).rejects.toThrow(
      "AUTH_REQUIRED",
    );
    expect((await service.authenticate("Bearer secret", "org-a", "corr-1")).organizationId).toBe(
      "org-a",
    );
  });

  it("caps pagination and returns versioned envelope", async () => {
    const { service, store } = serviceWithStore();
    const context = await service.authenticate("Bearer secret", "org-a", "corr-1");
    const result = await service.list("parties", context, undefined, 999);
    expect(result.apiVersion).toBe("v1");
    expect(store.list).toHaveBeenCalledWith("parties", "org-a", 0, 101);
  });

  it("requires write role and idempotency key", async () => {
    const { service } = serviceWithStore();
    const context = {
      organizationId: "org-a",
      actorId: "u1",
      roles: ["viewer"],
      correlationId: "c1",
    };
    await expect(
      service.mutate("create", "parties", undefined, context, { data: {} }, "idem"),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      service.mutate(
        "create",
        "parties",
        undefined,
        { ...context, roles: ["integration"] },
        { data: {} },
        undefined,
      ),
    ).rejects.toThrow("IDEMPOTENCY_KEY_REQUIRED");
  });
});
