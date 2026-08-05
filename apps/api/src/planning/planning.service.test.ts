import { describe, expect, it, vi } from "vitest";
import { PlanningService } from "./planning.service.js";

const context = {
  organizationId: "org-a",
  actorId: "planner",
  roles: ["finance_admin"],
  correlationId: "corr",
};

describe("PlanningService", () => {
  it("T-FCT-001 requires explicit idempotency for target mutations", async () => {
    const store = { create: vi.fn().mockResolvedValue({ resource: { id: "target-1" } }) };
    const service = new PlanningService(store as never, {} as never);
    await expect(
      service.create(context, "revenue-targets", {
        schemaVersion: 1,
        reason: "Plan",
        actualBasis: "recognized",
      }),
    ).rejects.toThrow("IDEMPOTENCY_KEY_REQUIRED");
    const result = await service.create(
      context,
      "revenue-targets",
      { schemaVersion: 1, reason: "Plan", actualBasis: "recognized" },
      "target-key",
    );
    expect(result.data).toMatchObject({ resource: { id: "target-1" } });
  });

  it("T-FCT-002 restricts publishing and requires optimistic concurrency", async () => {
    const service = new PlanningService({ transition: vi.fn() } as never, {} as never);
    await expect(
      service.transition(
        { ...context, roles: ["project_manager"] },
        "forecast-versions",
        "f-1",
        "publish",
        { schemaVersion: 1, expectedResourceVersion: "1", reason: "Publish" },
        "key",
      ),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      service.transition(
        context,
        "forecast-versions",
        "f-1",
        "publish",
        { schemaVersion: 1, reason: "Publish" },
        "key",
      ),
    ).rejects.toThrow("VALIDATION_FAILED");
  });
});
