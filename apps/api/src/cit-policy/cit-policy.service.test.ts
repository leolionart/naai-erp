import { describe, expect, it, vi } from "vitest";
import { CitPolicyService } from "./cit-policy.service.js";
import type { CitPolicyStore } from "./cit-policy.types.js";

describe("CitPolicyService", () => {
  const store: CitPolicyStore = {
    getPolicy: vi.fn(),
    upsertPolicy: vi.fn(),
    upsertRateTiers: vi.fn(),
    estimateReport: vi.fn(),
  };
  const masterData = { authenticate: vi.fn() };
  const service = new CitPolicyService(store, masterData as never);

  const ownerCtx = {
    organizationId: "org-1",
    actorId: "owner-1",
    roles: ["owner" as const],
    correlationId: "corr-1",
  };
  const viewerCtx = {
    organizationId: "org-1",
    actorId: "viewer-1",
    roles: ["viewer" as const],
    correlationId: "corr-2",
  };

  it("enforces RBAC and idempotency key on policy mutations", async () => {
    await expect(
      service.upsertPolicy(viewerCtx, { citSmallEnterpriseIneligible: true, reason: "test" }, "k1"),
    ).rejects.toThrow("FORBIDDEN");

    await expect(
      service.upsertPolicy(ownerCtx, { citSmallEnterpriseIneligible: true, reason: "test" }),
    ).rejects.toThrow("IDEMPOTENCY_KEY_REQUIRED");

    await expect(
      service.upsertPolicy(ownerCtx, { citSmallEnterpriseIneligible: true, reason: "  " }, "k2"),
    ).rejects.toThrow("VALIDATION_FAILED");
  });

  it("parses valid CIT policy and tier schedule updates", async () => {
    vi.mocked(store.upsertPolicy).mockResolvedValueOnce({
      policy: {
        organizationId: "org-1",
        citSmallEnterpriseIneligible: true,
        ineligibilityReason: "Related party",
        priorYearRevenueOverrideMinor: "4500000000",
        version: "1",
        updatedBy: "owner-1",
        updatedAt: "2026-11-26T00:00:00.000Z",
        organizationSchedules: [],
        statutorySchedules: [],
      },
      idempotencyReplayed: false,
    });

    const res = await service.upsertPolicy(
      ownerCtx,
      {
        citSmallEnterpriseIneligible: true,
        ineligibilityReason: "Related party",
        priorYearRevenueOverrideMinor: "4500000000",
        reason: "Subsidiary declaration",
      },
      "idem-1",
      "0",
    );
    expect(res).toMatchObject({
      organizationId: "org-1",
      data: {
        idempotencyReplayed: false,
        policy: { citSmallEnterpriseIneligible: true, version: "1" },
      },
    });
    expect(store.upsertPolicy).toHaveBeenCalledWith(
      ownerCtx,
      {
        citSmallEnterpriseIneligible: true,
        ineligibilityReason: "Related party",
        priorYearRevenueOverrideMinor: "4500000000",
        reason: "Subsidiary declaration",
      },
      "idem-1",
      "0",
    );
  });

  it("validates estimate report date ranges", () => {
    expect(service.parseEstimateQuery({ startsOn: "2026-01-01", endsOn: "2026-12-31" })).toEqual({
      startsOn: "2026-01-01",
      endsOn: "2026-12-31",
    });
    expect(() =>
      service.parseEstimateQuery({ startsOn: "2026-12-31", endsOn: "2026-01-01" }),
    ).toThrow("VALIDATION_FAILED");
  });
});
