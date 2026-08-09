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
  it("updates and deactivates workers with versioned reasoned mutations", async () => {
    const store = { updateWorker: vi.fn().mockResolvedValue({ resource: { id: "w" } }) };
    const service = new WorkforceService(store as never, {} as never);
    await service.updateWorker(
      context,
      "w",
      {
        schemaVersion: 1,
        expectedResourceVersion: "1",
        reason: "Correct payroll classification",
        employmentKind: "contractor",
        endsOn: "2026-12-31",
      },
      "worker-update",
    );
    await service.updateWorker(
      context,
      "w",
      { schemaVersion: 1, expectedResourceVersion: "2", reason: "Employment ended" },
      "worker-deactivate",
      true,
    );
    expect(store.updateWorker).toHaveBeenNthCalledWith(
      1,
      context,
      "w",
      expect.objectContaining({ employmentKind: "contractor" }),
      "worker-update",
      false,
    );
    expect(store.updateWorker).toHaveBeenNthCalledWith(
      2,
      context,
      "w",
      expect.objectContaining({ reason: "Employment ended" }),
      "worker-deactivate",
      true,
    );
  });
});
