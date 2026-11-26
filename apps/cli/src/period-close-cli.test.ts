import { describe, expect, it, vi } from "vitest";
import { NaaiErpClient } from "./client.js";
import { resolvePeriodCloseCliRoute } from "./period-close-cli.js";

describe("period-close CLI routing (ERP-987)", () => {
  it("resolves fiscal-periods list, close-checklist, and checklist-note while leaving close/reopen to standard workflow", () => {
    expect(
      resolvePeriodCloseCliRoute({
        baseUrl: "http://localhost:3001",
        organizationId: "org-1",
        resource: "fiscal-periods",
        action: "list",
        payload: { fiscalYear: 2026 },
      }),
    ).toEqual({
      method: "GET",
      url: "http://localhost:3001/api/v1/organizations/org-1/fiscal-periods?fiscalYear=2026",
      includeBody: false,
    });

    expect(
      resolvePeriodCloseCliRoute({
        baseUrl: "http://localhost:3001",
        organizationId: "org-1",
        resource: "close-checklist",
        action: "get",
        key: "2026:08",
      }),
    ).toEqual({
      method: "GET",
      url: "http://localhost:3001/api/v1/organizations/org-1/fiscal-periods/2026/8/close-checklist",
      includeBody: false,
    });

    expect(
      resolvePeriodCloseCliRoute({
        baseUrl: "http://localhost:3001",
        organizationId: "org-1",
        resource: "close-checklist",
        action: "note",
        key: "2026:8",
      }),
    ).toEqual({
      method: "POST",
      url: "http://localhost:3001/api/v1/organizations/org-1/fiscal-periods/2026/8/close-checklist/notes",
      includeBody: true,
    });

    expect(
      resolvePeriodCloseCliRoute({
        baseUrl: "http://localhost:3001",
        organizationId: "org-1",
        resource: "fiscal-periods",
        action: "close",
      }),
    ).toBeNull();
  });

  it("routes cash-counts and owner-settlements through NaaiErpClient with idempotency headers", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({ apiVersion: "v1", data: { ok: true } }),
    }));
    const client = new NaaiErpClient(
      { baseUrl: "http://localhost:3001", organizationId: "org-987", token: "tok-1" },
      fetchMock as unknown as typeof fetch,
    );

    await client.request(
      "cash-counts",
      "record",
      { countedOn: "2026-08-31", countedBalanceMinor: "1850000", reason: "Kiem quy" },
      undefined,
      undefined,
      "idem-cc-1",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1/organizations/org-987/banking/cash-counts",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "idempotency-key": "idem-cc-1" }),
      }),
    );

    await client.request("owner-settlements", "position", {
      fiscalYear: 2026,
      asOf: "2026-12-31",
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://localhost:3001/api/v1/organizations/org-987/banking/owner-settlements/position?fiscalYear=2026&asOf=2026-12-31",
      expect.objectContaining({ method: "GET" }),
    );

    await client.request(
      "owner-settlements",
      "settle",
      { fiscalYear: 2026, option: "profit_distribution", reason: "Chia loi nhuan" },
      undefined,
      undefined,
      "idem-settle-1",
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://localhost:3001/api/v1/organizations/org-987/banking/owner-settlements",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "idempotency-key": "idem-settle-1" }),
      }),
    );
  });
});
