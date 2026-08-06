import { describe, expect, it, vi } from "vitest";
import { OperatingDashboardService } from "./operating-dashboard.service.js";

describe("operating dashboard service", () => {
  const store = { read: vi.fn() };
  const master = { authenticate: vi.fn() };
  const service = new OperatingDashboardService(store, master as never);

  it("defaults to year-to-date and validates bounded query inputs", () => {
    expect(service.parseQuery({ asOf: "2026-08-06" })).toEqual({
      asOf: "2026-08-06",
      startsOn: "2026-01-01",
      endsOn: "2026-08-06",
      limit: 10,
    });
    expect(() => service.parseQuery({ asOf: "2026-08-06", startsOn: "2026-09-01" })).toThrow(
      "VALIDATION_FAILED",
    );
    expect(() => service.parseQuery({ asOf: "2026-08-06", limit: "51" })).toThrow(
      "VALIDATION_FAILED",
    );
  });

  it("returns the standard API envelope without browser-side recalculation", async () => {
    const data = { schemaVersion: 1, asOf: "2026-08-06" };
    store.read.mockResolvedValueOnce(data);
    await expect(
      service.read(
        { organizationId: "naai", actorId: "owner", roles: ["owner"], correlationId: "req" },
        service.parseQuery({ asOf: "2026-08-06" }),
      ),
    ).resolves.toMatchObject({ requestId: "req", organizationId: "naai", data });
  });
});
