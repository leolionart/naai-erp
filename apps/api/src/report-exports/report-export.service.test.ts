import { describe, expect, it, vi } from "vitest";
import { ReportExportService } from "./report-export.service.js";
import type { ReportExportStore } from "./report-export.types.js";

const store = {
  listSnapshots: vi.fn(),
  getSnapshot: vi.fn(),
  createSnapshot: vi.fn(),
  reproduceSnapshot: vi.fn(),
  listExports: vi.fn(),
  getExport: vi.fn(),
  createExport: vi.fn(),
  downloadExport: vi.fn(),
  supersedeExport: vi.fn(),
} satisfies ReportExportStore;
const master = { authenticate: vi.fn() };
const service = new ReportExportService(store, master as never);
const context = {
  organizationId: "org-1",
  actorId: "maker",
  roles: ["accountant"],
  correlationId: "req-1",
};

describe("ERP-650 report export service", () => {
  it("validates the snapshot and export contracts", () => {
    expect(
      service.parseSnapshot({
        reportKind: "profit_and_loss",
        period: { startsOn: "2026-08-01", endsOn: "2026-08-31", asOfDate: "2026-08-31" },
        accountingBasis: "accrual",
        formulaVersions: { pnl: "v1" },
        request: {},
      }),
    ).toMatchObject({ reportKind: "profit_and_loss" });
    expect(() => service.parseSnapshot({ reportKind: "unknown" })).toThrow("VALIDATION_FAILED");
    expect(
      service.parseExport({
        snapshotId: "snap",
        snapshotVersion: 1,
        reportKind: "profit_and_loss",
        format: "xlsx",
      }),
    ).toMatchObject({ format: "xlsx" });
  });

  it("requires write authorization and idempotency for mutations", async () => {
    const input = service.parseSnapshot({
      reportKind: "profit_and_loss",
      period: { startsOn: "2026-08-01", endsOn: "2026-08-31", asOfDate: "2026-08-31" },
      accountingBasis: "accrual",
      formulaVersions: { pnl: "v1" },
      request: {},
    });
    await expect(service.createSnapshot(context, input)).rejects.toThrow(
      "IDEMPOTENCY_KEY_REQUIRED",
    );
    await expect(
      service.createSnapshot({ ...context, roles: ["viewer"] }, input, "key"),
    ).rejects.toThrow("FORBIDDEN");
  });
});
