import { describe, expect, it, vi } from "vitest";
import { ProjectCostService } from "./project-cost.service.js";
const c = { organizationId: "org", actorId: "owner", roles: ["owner"], correlationId: "corr" };
describe("ProjectCostService", () => {
  it("delegates exact split allocation", async () => {
    const store = { createAllocation: vi.fn().mockResolvedValue({ resource: { id: "a" } }) },
      s = new ProjectCostService(store as never, {} as never);
    const r = await s.create(
      c,
      {
        schemaVersion: 1,
        sourceId: "source",
        reason: "Allocate",
        splits: [{ projectId: "p", amountMinor: "10", baseAmountMinor: "10" }],
      },
      "key",
    );
    expect(store.createAllocation).toHaveBeenCalledOnce();
    expect(r.data).toMatchObject({ resource: { id: "a" } });
  });
  it("protects approval lifecycle", async () => {
    const s = new ProjectCostService({} as never, {} as never);
    await expect(
      s.transition(
        { ...c, roles: ["project_manager"] },
        "a",
        "approve",
        { schemaVersion: 1, expectedResourceVersion: "1", reason: "ok" },
        "key",
      ),
    ).rejects.toThrow("FORBIDDEN");
  });
});
