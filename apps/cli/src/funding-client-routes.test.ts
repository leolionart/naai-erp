import { describe, expect, it, vi } from "vitest";
import { NaaiErpClient } from "./client.js";

describe("ERP-980 owner-custody-migration CLI routes", () => {
  it("routes owner-custody-migration dry-run and commit to canonical REST endpoints", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ apiVersion: "v1", data: { ok: true } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-980", token: "tok" },
      fetchFn,
    );

    await client.request("owner-custody-migration", "dry-run", {});
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-980/funding-plans/owner-custody-migration/dry-run",
      expect.objectContaining({ method: "POST" }),
    );

    await client.request(
      "owner-custody-migration",
      "commit",
      { planHash: "abc", reason: "Migrate custody cash" },
      undefined,
      undefined,
      "idem-980",
    );
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-980/funding-plans/owner-custody-migration/commit",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "idempotency-key": "idem-980" }),
      }),
    );

    await client.request("funding-plans", "owner-custody-dry-run", {});
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-980/funding-plans/owner-custody-migration/dry-run",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
