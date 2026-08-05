import { describe, expect, it, vi } from "vitest";
import { LedgerReportService } from "./ledger-report.service.js";

const context = {
  organizationId: "org-a",
  actorId: "accountant-a",
  roles: ["accountant"],
  correlationId: "corr-a",
} as const;
const opening = {
  openingDate: "2026-01-01",
  currency: "VND",
  description: "Opening balances 2026",
  controlDebitMinor: "500",
  controlCreditMinor: "500",
  lines: [
    { accountCode: "111", debitMinor: "500" },
    { accountCode: "411", creditMinor: "500" },
  ],
} as const;

describe("ERP-240 LedgerReportService", () => {
  it("returns balanced posted-ledger Trial Balance metadata", async () => {
    const store = {
      trialBalance: vi.fn().mockResolvedValue({ balanced: true, totals: { differenceMinor: "0" } }),
    };
    const service = new LedgerReportService(store as never, {} as never);
    const result = await service.trialBalance(context, { from: "2026-01-01", to: "2026-01-31" });
    expect(result.data).toMatchObject({ balanced: true, totals: { differenceMinor: "0" } });
  });

  it("validates opening totals before persisting and requires idempotency", async () => {
    const store = {
      inspectControlAccounts: vi.fn().mockResolvedValue([
        { code: "111", is_control_account: false, is_active: true },
        { code: "411", is_control_account: false, is_active: true },
      ]),
      createOpeningBalance: vi.fn().mockResolvedValue({ importId: "ob-1", journalId: "j-1" }),
    };
    const service = new LedgerReportService(store as never, {} as never);
    await expect(service.createOpeningBalance(context, opening)).rejects.toThrow(
      "IDEMPOTENCY_KEY_REQUIRED",
    );
    const result = await service.createOpeningBalance(context, opening, "idem-1");
    expect(result.data).toMatchObject({ importId: "ob-1", journalId: "j-1" });
  });

  it("rejects unexplained variance and control accounts without party/document detail", async () => {
    const store = {
      inspectControlAccounts: vi.fn().mockResolvedValue([
        { code: "131", is_control_account: true, is_active: true },
        { code: "411", is_control_account: false, is_active: true },
      ]),
    };
    const service = new LedgerReportService(store as never, {} as never);
    await expect(
      service.dryRunOpeningBalance(context, { ...opening, controlCreditMinor: "499" }),
    ).rejects.toThrow("OPENING_BALANCE_CONTROL_TOTAL_MISMATCH");
    await expect(
      service.dryRunOpeningBalance(context, {
        ...opening,
        lines: [
          { accountCode: "131", debitMinor: "500" },
          { accountCode: "411", creditMinor: "500" },
        ],
      }),
    ).rejects.toThrow("OPENING_BALANCE_SUBLEDGER_DETAIL_REQUIRED");
  });

  it("denies opening imports to viewers", async () => {
    const service = new LedgerReportService({} as never, {} as never);
    await expect(
      service.dryRunOpeningBalance({ ...context, roles: ["viewer"] }, opening),
    ).rejects.toThrow("FORBIDDEN");
  });
});
