import { describe, expect, it, vi } from "vitest";
import { OperationalLogService } from "./operational-log.service.js";

const context = {
  organizationId: "org-1",
  actorId: "owner-1",
  roles: ["owner"],
  correlationId: "corr-1",
};
describe("ERP-917 operational log reads", () => {
  it("keeps reads organization scoped and enveloped", async () => {
    const store = {
      list: vi.fn(async () => ({ items: [{ id: "log-1" }] })),
      purgeExpired: vi.fn(),
    };
    const service = new OperationalLogService(store, {} as never);
    const result = await service.list(context, { status: "failed", limit: 25 });
    expect(store.list).toHaveBeenCalledWith("org-1", { status: "failed", limit: 25 });
    expect(result).toMatchObject({
      organizationId: "org-1",
      requestId: "corr-1",
      data: { items: [{ id: "log-1" }] },
    });
  });

  it("does not expose logs to integration-only credentials", async () => {
    const service = new OperationalLogService(
      { list: vi.fn(), purgeExpired: vi.fn() },
      {} as never,
    );
    await expect(service.list({ ...context, roles: ["integration"] }, {})).rejects.toThrow(
      "FORBIDDEN",
    );
  });
});

describe("ERP-927 unified activity reads", () => {
  it("returns the organization-scoped unified activity envelope", async () => {
    const store = {
      list: vi.fn(),
      listAll: vi.fn(async () => ({ items: [{ source: "resource_audit", event_type: "update" }] })),
      purgeExpired: vi.fn(),
    };
    const service = new OperationalLogService(store, {} as never);
    const result = await service.listAll(context, { source: "resource_audit", limit: 25 });
    expect(store.listAll).toHaveBeenCalledWith("org-1", { source: "resource_audit", limit: 25 });
    expect(result.data).toMatchObject({ items: [{ source: "resource_audit" }] });
  });

  it("keeps unified reads unavailable to integration-only credentials", async () => {
    const service = new OperationalLogService(
      { list: vi.fn(), listAll: vi.fn(), purgeExpired: vi.fn() },
      {} as never,
    );
    await expect(service.listAll({ ...context, roles: ["integration"] }, {})).rejects.toThrow(
      "FORBIDDEN",
    );
  });
});
