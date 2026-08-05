import { describe, expect, it, vi } from "vitest";
import { WorkforceService } from "./workforce.service.js";

const context = { organizationId: "org", actorId: "user", roles: ["owner"], correlationId: "corr" };
describe("WorkforceService", () => {
  it("validates and delegates weekly timesheet creation", async () => {
    const store = { createTimesheet: vi.fn().mockResolvedValue({ resource: { id: "ts" } }) };
    const service = new WorkforceService(store as never, {} as never);
    const result = await service.createTimesheet(
      context,
      {
        schemaVersion: 1,
        workerId: "w",
        weekStartsOn: "2026-08-03",
        entries: [{ minutes: 60 }],
        reason: "Weekly entry",
      },
      "key",
    );
    expect(store.createTimesheet).toHaveBeenCalledOnce();
    expect(result.data).toMatchObject({ resource: { id: "ts" } });
  });
  it("requires approval authority for approving timesheets", async () => {
    const service = new WorkforceService({} as never, {} as never);
    await expect(
      service.transition(
        { ...context, roles: ["project_manager"] },
        "ts",
        "approve",
        { schemaVersion: 1, expectedResourceVersion: "1", reason: "Checked" },
        "key",
      ),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("rejects zero adjustments", async () => {
    const service = new WorkforceService({} as never, {} as never);
    await expect(
      service.adjustment(
        context,
        "ts",
        {
          schemaVersion: 1,
          originalEntryId: "entry",
          workDate: "2026-08-03",
          minutesDelta: 0,
          expectedResourceVersion: "1",
          reason: "none",
        },
        "key",
      ),
    ).rejects.toThrow("VALIDATION_FAILED");
  });
});
