import { describe, expect, it, vi } from "vitest";
import type { MasterDataService } from "../master-data/master-data.service.js";
import { AgingService } from "./aging.service.js";
import type { AgingStore } from "./aging.types.js";

const context = {
  organizationId: "org-a",
  actorId: "user-a",
  roles: ["viewer"],
  correlationId: "corr-a",
};

describe("ERP-430 aging service", () => {
  const store = {
    report: vi.fn().mockResolvedValue({ side: "ar", items: [] }),
    item: vi.fn().mockResolvedValue({ item: { id: "doc:1" } }),
  } satisfies AgingStore;
  const master = {
    authenticate: vi.fn().mockResolvedValue(context),
  } as unknown as MasterDataService;
  const service = new AgingService(store, master);

  it("validates deterministic as-of pagination and currency filters", () => {
    expect(
      service.parseQuery({
        asOf: "2026-08-31",
        limit: "25",
        includeSettled: "false",
      }),
    ).toMatchObject({ asOf: "2026-08-31", limit: 25, includeSettled: false });
    expect(() => service.parseQuery({ asOf: "31-08-2026" })).toThrow("VALIDATION_FAILED");
    expect(() => service.parseQuery({ asOf: "2026-08-31", limit: "101" })).toThrow(
      "VALIDATION_FAILED",
    );
  });

  it("returns versioned envelopes for list and item reads", async () => {
    await expect(
      service.report(context, "ar", service.parseQuery({ asOf: "2026-08-31" })),
    ).resolves.toMatchObject({ apiVersion: "v1", organizationId: "org-a" });
    await expect(
      service.item(context, "ar", "doc:1", service.parseQuery({ asOf: "2026-08-31" })),
    ).resolves.toMatchObject({ data: { item: { id: "doc:1" } } });
  });
});
