import { describe, expect, it, vi } from "vitest";
import { CustomerServiceSubscriptionService } from "./customer-service-subscription.service.js";
const context = {
  organizationId: "org",
  actorId: "owner",
  roles: ["owner"],
  correlationId: "corr",
};
const store = () => ({
  listPlans: vi.fn(),
  getPlan: vi.fn(),
  createPlan: vi.fn(),
  updatePlan: vi.fn(),
  deactivatePlan: vi.fn(),
  listSubscriptions: vi.fn(),
  getSubscription: vi.fn(),
  createSubscription: vi.fn(),
  updateSubscription: vi.fn(),
  transition: vi.fn(),
  validatePortable: vi.fn(),
});
describe("ERP-870 subscription API service", () => {
  it("requires idempotency and If-Match version on mutations", async () => {
    const s = store(),
      service = new CustomerServiceSubscriptionService(s, {} as never);
    await expect(
      service.createPlan(context, {
        schemaVersion: 1,
        code: "M",
        name: "Monthly",
        serviceLineCode: "OPS",
        defaultUnitPriceMinor: "100",
        currency: "VND",
        recurrence: { frequency: "month", interval: 1, billingDay: 1 },
        reason: "create",
      }),
    ).rejects.toThrow("IDEMPOTENCY_KEY_REQUIRED");
    await expect(
      service.updateSubscription(
        context,
        "sub",
        { schemaVersion: 1, reason: "edit", quantity: "2" },
        "key",
      ),
    ).rejects.toThrow("VALIDATION_FAILED");
  });
  it("accepts the quick-create contract and applies commercial defaults", async () => {
    const s = store();
    s.createPlan.mockImplementation(async (_context, input) => input);
    const service = new CustomerServiceSubscriptionService(s, {} as never);
    await service.createPlan(
      context,
      {
        schemaVersion: 1,
        name: "Dịch vụ quản trị website",
        defaultUnitPriceMinor: "500000",
      },
      "quick-plan",
    );
    expect(s.createPlan).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        code: "DICH-VU-QUAN-TRI-WEBSITE",
        currency: "VND",
        recurrence: { frequency: "month", interval: 1, billingDay: 1 },
        reason: "Tạo nhanh gói dịch vụ",
      }),
      "quick-plan",
    );
  });
  it("rejects invalid lifecycle actions before storage", async () => {
    const s = store(),
      service = new CustomerServiceSubscriptionService(s, {} as never);
    await expect(
      service.transition(
        context,
        "sub",
        "delete",
        { schemaVersion: 1, expectedResourceVersion: "1", effectiveOn: "2026-01-01", reason: "x" },
        "key",
      ),
    ).rejects.toThrow("RESOURCE_NOT_FOUND");
    expect(s.transition).not.toHaveBeenCalled();
  });
  it("returns accounting-neutral schedule generated from the stored snapshot", async () => {
    const s = store();
    s.getSubscription.mockResolvedValue({
      id: "sub",
      startsOn: "2026-01-01",
      endsOn: null,
      lifecycle: "active",
      recurrenceSnapshot: { frequency: "month", interval: 1, billingDay: 1 },
      quantity: "1",
      unitPriceMinor: "100",
      currency: "VND",
    });
    const service = new CustomerServiceSubscriptionService(s, {} as never);
    const result = await service.preview(context, "sub", "2026-02-28");
    expect((result.data as Record<string, unknown>).accountingNeutral).toBe(true);
    expect((result.data as { periods: unknown[] }).periods).toHaveLength(2);
    expect(s.transition).not.toHaveBeenCalled();
  });
  it("preflights portable relationships without mutation", async () => {
    const s = store(),
      service = new CustomerServiceSubscriptionService(s, {} as never);
    await expect(
      service.validatePortableInput(context, "customer_service_subscriptions", {
        schemaVersion: 1,
        customerPartyId: "client",
        servicePlanId: "plan",
        startsOn: "2026-01-01",
        quantity: "1",
        reason: "restore",
      }),
    ).resolves.toEqual({ valid: true });
    expect(s.validatePortable).toHaveBeenCalledOnce();
    expect(s.createSubscription).not.toHaveBeenCalled();
  });
});
