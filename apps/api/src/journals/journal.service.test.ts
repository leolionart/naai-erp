import { describe, expect, it, vi } from "vitest";
import { JournalService } from "./journal.service.js";

const context = {
  organizationId: "org-a",
  actorId: "actor-a",
  roles: ["finance_admin"],
  correlationId: "corr-a",
} as const;

describe("JournalService", () => {
  it("exposes exact string amounts to the store and returns mutation metadata", async () => {
    const store = {
      create: vi.fn().mockResolvedValue({
        journalId: "journal-1",
        resourceVersion: "1",
        auditEventId: "audit-1",
        nextActions: ["post"],
      }),
    };
    const service = new JournalService(store as never, {} as never);
    const input = {
      journalDate: "2026-08-05",
      description: "Capital",
      currency: "VND",
      lines: [
        { accountCode: "111", debitMinor: "500000000" },
        { accountCode: "411", creditMinor: "500000000" },
      ],
    } as const;
    const result = await service.create(context, input, "idem-1");
    expect(store.create).toHaveBeenCalledWith(context, input, "idem-1");
    expect(result.data).toMatchObject({ journalId: "journal-1", resourceVersion: "1" });
  });

  it("rejects invalid polarity and missing idempotency", async () => {
    const service = new JournalService({} as never, {} as never);
    const invalid = {
      journalDate: "2026-08-05",
      description: "Invalid",
      currency: "VND",
      lines: [{ accountCode: "111", debitMinor: "1", creditMinor: "1" }],
    } as const;
    await expect(service.create(context, invalid, "idem-1")).rejects.toThrow("VALIDATION_FAILED");
    await expect(service.post(context, "journal-1", undefined)).rejects.toThrow(
      "IDEMPOTENCY_KEY_REQUIRED",
    );
  });

  it("does not allow an integration-only identity to post", async () => {
    const service = new JournalService({} as never, {} as never);
    await expect(
      service.post({ ...context, roles: ["integration"] }, "journal-1", "idem-1"),
    ).rejects.toThrow("FORBIDDEN");
  });
});
