import { describe, expect, it, vi } from "vitest";
import { TimeController } from "./time.controller.js";
import type { MasterDataService } from "../master-data/master-data.service.js";

describe("ERP-988 TimeController missing workforce_profiles guard", () => {
  it("returns an empty items list when workforce_profiles was removed (lowercase message or SQLSTATE 42P01)", async () => {
    const pgMissingRelation = Object.assign(
      new Error('relation "workforce_profiles" does not exist'),
      { code: "42P01" },
    );
    const master = {
      authenticate: vi.fn().mockResolvedValue({
        organizationId: "org-1",
        actorId: "owner-1",
        correlationId: "corr-1",
        roles: ["owner"],
      }),
      list: vi.fn().mockRejectedValue(pgMissingRelation),
    } as unknown as MasterDataService;

    const controller = new TimeController(master);
    const response = await controller.workers("org-1", "Bearer tok", "corr-1");
    expect(response).toEqual({
      apiVersion: "v1",
      requestId: "corr-1",
      organizationId: "org-1",
      items: [],
    });
  });
});
