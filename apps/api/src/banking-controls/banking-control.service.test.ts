import { describe, expect, it, vi } from "vitest";
import type { MasterDataService } from "../master-data/master-data.service.js";
import { BankingControlService } from "./banking-control.service.js";
import type { BankingControlStore } from "./banking-control.types.js";
const context = {
  organizationId: "org",
  actorId: "finance",
  roles: ["finance_admin"],
  correlationId: "corr",
};
describe("ERP-440 banking control service", () => {
  const store = {
    list: vi.fn().mockResolvedValue({ items: [] }),
    get: vi.fn(),
    create: vi.fn().mockResolvedValue({}),
    review: vi.fn().mockResolvedValue({}),
    close: vi.fn().mockResolvedValue({}),
    createException: vi.fn().mockResolvedValue({}),
    reviewException: vi.fn().mockResolvedValue({}),
  } satisfies BankingControlStore;
  const master = {
    authenticate: vi.fn().mockResolvedValue(context),
  } as unknown as MasterDataService;
  const service = new BankingControlService(store, master);
  it("validates statement sessions and requires idempotency", async () => {
    const input = {
      schemaVersion: 1 as const,
      financialAccountId: "bank",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      openingBalanceMinor: "100",
      closingBalanceMinor: "120",
      currency: "VND",
      importIds: ["import"],
      reason: "Monthly close",
    };
    await expect(service.create(context, input)).rejects.toThrow("IDEMPOTENCY_KEY_REQUIRED");
    await expect(service.create(context, input, "key")).resolves.toMatchObject({
      apiVersion: "v1",
    });
    await expect(
      service.create(context, { ...input, periodEnd: "2026-07-31" }, "bad"),
    ).rejects.toThrow("VALIDATION_FAILED");
  });
  it("limits exception approval to finance owners", async () => {
    await expect(
      service.reviewException(
        { ...context, roles: ["accountant"] },
        "s",
        "e",
        "approve",
        { schemaVersion: 1, expectedResourceVersion: "1", reason: "Approved" },
        "key",
      ),
    ).rejects.toThrow("FORBIDDEN");
  });
});
