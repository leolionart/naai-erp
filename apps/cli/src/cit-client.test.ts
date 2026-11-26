import { describe, expect, it, vi } from "vitest";
import { NaaiErpClient } from "./client.js";

describe("CLI CIT policy and estimated CIT report routing", () => {
  it("routes cit-policy get, set, set-tiers and estimated-cit get over REST", async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );

    await client.request("cit-policy", "get", { year: 2026 });
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/cit-policy?year=2026",
      expect.objectContaining({ method: "GET" }),
    );

    await client.request(
      "cit-policy",
      "set",
      { citSmallEnterpriseIneligible: true, reason: "Related party" },
      undefined,
      "1",
      "idem-cit-1",
    );
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/cit-policy",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "idempotency-key": "idem-cit-1",
          "if-match": "1",
        }),
      }),
    );

    await client.request(
      "cit-policy",
      "set-tiers",
      {
        tiers: [
          { tierCode: "standard_20", label: "Standard", maxRevenueMinor: null, rateBps: 2000 },
        ],
        reason: "Update 2027 tiers",
      },
      "2027",
      undefined,
      "idem-cit-2",
    );
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/cit-policy/rate-tiers/2027",
      expect.objectContaining({ method: "PUT" }),
    );

    await client.request("estimated-cit", "get", {
      startsOn: "2026-01-01",
      endsOn: "2026-12-31",
    });
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/reports/tax/estimated-cit?startsOn=2026-01-01&endsOn=2026-12-31",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
