import { describe, expect, it, vi } from "vitest";
import { ReconciliationService } from "./reconciliation.service.js";

const context = {
  organizationId: "org-a",
  actorId: "finance",
  roles: ["finance_admin"],
  correlationId: "corr",
};
const fixture = () => {
  const store = {
    getCandidates: vi.fn().mockResolvedValue({ items: [] }),
    suggest: vi.fn().mockResolvedValue({ state: "suggested" }),
    match: vi.fn().mockResolvedValue({}),
    reconcile: vi.fn().mockResolvedValue({}),
    unreconcile: vi.fn().mockResolvedValue({}),
    list: vi.fn().mockResolvedValue({ items: [] }),
    get: vi.fn().mockResolvedValue({ id: "rec-1" }),
  };
  return { store, subject: new ReconciliationService(store, { authenticate: vi.fn() } as never) };
};

describe("ERP-410 reconciliation service", () => {
  it("requires finance authority and idempotency for suggestions", async () => {
    const { subject, store } = fixture();
    await subject.suggest(context, "txn-1", { schemaVersion: 1 }, "suggest-key");
    expect(store.suggest).toHaveBeenCalledWith(
      context,
      "txn-1",
      { schemaVersion: 1, thresholdBps: 7000, ambiguityMarginBps: 1000 },
      "suggest-key",
    );
    await expect(
      subject.suggest({ ...context, roles: ["viewer"] }, "txn-1", { schemaVersion: 1 }, "key"),
    ).rejects.toThrow("FORBIDDEN");
    await expect(subject.suggest(context, "txn-1", { schemaVersion: 1 })).rejects.toThrow(
      "IDEMPOTENCY_KEY_REQUIRED",
    );
  });
  it("requires explicit audited manual override metadata", async () => {
    const { subject } = fixture();
    await expect(
      subject.match(
        context,
        "txn-1",
        {
          schemaVersion: 1,
          baseAmountMinor: "100",
          manualOverride: true,
          overrideReason: "Review",
          allocations: [
            {
              targetType: "commercial_document",
              targetId: "doc-1",
              targetAmountMinor: "100",
              targetCurrency: "VND",
              baseAmountMinor: "100",
            },
          ],
        },
        "key",
      ),
    ).rejects.toThrow("RECONCILIATION_OVERRIDE_REASON_REQUIRED");
  });
  it("validates balanced-input primitives before persistence", async () => {
    const { subject, store } = fixture();
    await subject.match(
      context,
      "txn-1",
      {
        schemaVersion: 1,
        baseAmountMinor: "100",
        allocations: [
          {
            targetType: "commercial_document",
            targetId: "doc-1",
            targetAmountMinor: "100",
            targetCurrency: "VND",
            baseAmountMinor: "100",
          },
        ],
        adjustments: [],
      },
      "match-key",
    );
    expect(store.match).toHaveBeenCalledOnce();
    await expect(
      subject.reconcile(context, "txn-1", { schemaVersion: 1, reason: " " }, "key"),
    ).rejects.toThrow("VALIDATION_FAILED");
  });
});
