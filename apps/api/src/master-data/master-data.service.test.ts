import { describe, expect, it, vi } from "vitest";
import { MasterDataService } from "./master-data.service.js";

function serviceWithStore(overrides: Record<string, unknown> = {}) {
  const store = {
    authenticate: vi.fn().mockResolvedValue({ actorId: "ai-1", roles: ["integration"] }),
    list: vi.fn().mockResolvedValue([{ id: "p1" }]),
    get: vi.fn().mockResolvedValue({ id: "p1" }),
    getVersion: vi.fn().mockResolvedValue("3"),
    mutate: vi.fn().mockResolvedValue({
      data: { id: "p1" },
      resourceVersion: "1",
      auditEventId: "a1",
      idempotencyReplayed: false,
      nextActions: ["update"],
    }),
    deleteProject: vi.fn().mockResolvedValue({
      data: { id: "p1", deleted: true },
      resourceVersion: "4",
      auditEventId: "a2",
      idempotencyReplayed: false,
      nextActions: [],
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

  it("returns the current resource version with a master-data record", async () => {
    const { service } = serviceWithStore();
    const context = await service.authenticate("Bearer secret", "org-a", "corr-1");
    const result = await service.get("projects", "encoded", context);
    expect(result.data).toEqual({ id: "p1", resource_version: "3" });
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

  it("accepts only 8% or 10% VAT for purchase products", async () => {
    const { service, store } = serviceWithStore();
    const context = {
      organizationId: "org-a",
      actorId: "u1",
      roles: ["integration"],
      correlationId: "c1",
    };
    await expect(
      service.mutate(
        "create",
        "purchase-products",
        undefined,
        context,
        { data: { code: "HOSTING", name: "Hosting", vat_rate_percent: 5 } },
        "idem-invalid-vat",
      ),
    ).rejects.toThrow("PURCHASE_PRODUCT_VAT_RATE_INVALID");
    await service.mutate(
      "create",
      "purchase-products",
      undefined,
      context,
      { data: { code: "HOSTING", name: "Hosting", vat_rate_percent: 8 } },
      "idem-valid-vat",
    );
    expect(store.mutate).toHaveBeenLastCalledWith(
      "create",
      "purchase-products",
      context,
      undefined,
      { data: { code: "HOSTING", name: "Hosting", vat_rate_percent: 8 } },
      "idem-valid-vat",
    );
  });

  it("restricts hard delete to projects with idempotency, If-Match and a reason", async () => {
    const { service, store } = serviceWithStore();
    const context = {
      organizationId: "org-a",
      actorId: "u1",
      roles: ["finance_admin"],
      correlationId: "c1",
    };
    await expect(
      service.delete("parties", "key", context, "duplicate", "1", "idem"),
    ).rejects.toThrow("PROJECT_DELETE_NOT_ALLOWED");
    await expect(
      service.delete("projects", "key", context, "duplicate", "1", undefined),
    ).rejects.toThrow("IDEMPOTENCY_KEY_REQUIRED");
    await expect(
      service.delete("projects", "key", context, "duplicate", undefined, "idem"),
    ).rejects.toThrow("IF_MATCH_REQUIRED");
    await expect(service.delete("projects", "key", context, "   ", "1", "idem")).rejects.toThrow(
      "DELETE_REASON_REQUIRED",
    );

    const result = await service.delete("projects", "key", context, " duplicate ", "3", "idem");
    expect(store.deleteProject).toHaveBeenCalledWith(
      context,
      "key",
      { expectedVersion: "3", reason: "duplicate" },
      "idem",
    );
    expect(result.data?.mutation.resourceVersion).toBe("4");
  });
});
