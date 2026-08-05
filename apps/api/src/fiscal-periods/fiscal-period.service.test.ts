import { describe, expect, it, vi } from "vitest";
import { FiscalPeriodService } from "./fiscal-period.service.js";

const input = {
  fiscalYear: 2026,
  periodNumber: 8,
  targetState: "soft_locked" as const,
  reason: "Month-end close",
};

describe("FiscalPeriodService", () => {
  it("allows finance close and returns AI mutation metadata", async () => {
    const store = {
      transition: vi.fn().mockResolvedValue({ state: "soft_locked", auditEventId: "audit-1" }),
    };
    const service = new FiscalPeriodService(store as never, {} as never);
    const context = {
      organizationId: "org-a",
      actorId: "finance-a",
      roles: ["finance_admin"],
      correlationId: "corr-a",
    } as const;
    const result = await service.transition("close", context, input, "idem-a");
    expect(store.transition).toHaveBeenCalledWith("close", context, input, "idem-a");
    expect(result.data).toMatchObject({ state: "soft_locked", auditEventId: "audit-1" });
  });

  it("requires elevated reopen permission and a reason", async () => {
    const service = new FiscalPeriodService({} as never, {} as never);
    await expect(
      service.transition(
        "reopen",
        {
          organizationId: "org-a",
          actorId: "accountant-a",
          roles: ["accountant"],
          correlationId: "corr-a",
        },
        { ...input, targetState: "open" },
        "idem-a",
      ),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      service.transition(
        "close",
        {
          organizationId: "org-a",
          actorId: "owner-a",
          roles: ["owner"],
          correlationId: "corr-a",
        },
        { ...input, reason: "" },
        "idem-a",
      ),
    ).rejects.toThrow("VALIDATION_FAILED");
  });
});
