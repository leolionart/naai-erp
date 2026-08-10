import { describe, expect, it, vi } from "vitest";
import { ExpenseReportController } from "./expense-report.controller.js";

describe("T-API-ERP-882-001 expense report routes", () => {
  it("authenticates and scopes reads to the route organization", async () => {
    const service = {
      authenticate: vi.fn().mockResolvedValue({
        organizationId: "org-a",
        actorId: "user",
        roles: [],
        correlationId: "corr",
      }),
      report: vi.fn().mockResolvedValue({ data: { seriesByCurrency: [] } }),
    };
    const controller = new ExpenseReportController(service as never);
    await controller.byPayee("org-a", "2026-01-01", "2026-01-31", "Bearer token", "corr");
    expect(service.authenticate).toHaveBeenCalledWith("Bearer token", "org-a", "corr");
    expect(service.report).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-a" }),
      { startsOn: "2026-01-01", endsOn: "2026-01-31" },
      "payee",
    );
  });
});
