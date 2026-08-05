import { describe, expect, it, vi } from "vitest";
import { allocateOverheadDeterministically } from "./pg-overhead-allocation.store.js";
import { OverheadAllocationService } from "./overhead-allocation.service.js";
describe("ERP-530 overhead allocation", () => {
  it("allocates minor units with stable largest-remainder tie breaking", () => {
    const x = allocateOverheadDeterministically(100n, [
      { projectId: "b", basis: 1n },
      { projectId: "a", basis: 1n },
      { projectId: "c", basis: 1n },
    ]);
    expect(x.map((s) => [s.projectId, s.amount.toString(), s.rank])).toEqual([
      ["a", "34", 1],
      ["b", "33", 2],
      ["c", "33", 3],
    ]);
    expect(x.reduce((n, s) => n + s.amount, 0n)).toBe(100n);
  });
  it("requires approval role and idempotency", async () => {
    const store = { list: vi.fn(), get: vi.fn(), create: vi.fn(), transition: vi.fn() },
      service = new OverheadAllocationService(store, {} as never),
      c = { organizationId: "o", actorId: "u", roles: ["project_manager"], correlationId: "c" };
    await expect(
      service.create(c, "overhead-source-pools", { schemaVersion: 1, reason: "x" }),
    ).rejects.toThrow("IDEMPOTENCY_KEY_REQUIRED");
    await expect(
      service.transition(
        c,
        "overhead-allocation-runs",
        "r",
        "approve",
        { schemaVersion: 1, expectedResourceVersion: "2", reason: "x" },
        "k",
      ),
    ).rejects.toThrow("FORBIDDEN");
  });
});
