import { describe, expect, it } from "vitest";
import type {
  CreateCustomerServiceSubscriptionRequest,
  CustomerServiceSubscriptionContract,
  CustomerSubscriptionLifecycleActionRequest,
  SubscriptionSchedulePreviewContract,
  UpdateCustomerServiceSubscriptionRequest,
} from "./customer-service-subscriptions.js";
describe("ERP-870 contracts", () => {
  it("exposes exact strings and accounting-neutral preview", () => {
    const subscription: CustomerServiceSubscriptionContract = {
      id: "sub-1",
      customerPartyId: "client-1",
      servicePlanId: "plan-1",
      projectId: "project-1",
      startsOn: "2026-01-01",
      endsOn: null,
      quantity: "1",
      unitPriceMinor: "5000000",
      currency: "VND",
      recurrenceSnapshot: { frequency: "month", interval: 1, billingDay: 1 },
      lifecycle: "draft",
      resourceVersion: "1",
      nextActions: ["update", "activate", "schedule-preview"],
    };
    const preview: SubscriptionSchedulePreviewContract = {
      accountingNeutral: true,
      subscriptionId: subscription.id,
      generatedThrough: "2026-03-31",
      periods: [],
    };
    expect(subscription.unitPriceMinor).toBe("5000000");
    expect(preview.accountingNeutral).toBe(true);
  });
  it("keeps create update and action machine contracts versioned", () => {
    const create: CreateCustomerServiceSubscriptionRequest = {
      schemaVersion: 1,
      customerPartyId: "client-1",
      servicePlanId: "plan-1",
      startsOn: "2026-01-01",
      quantity: "2",
      unitPriceMinor: "900000",
      reason: "new subscription",
    };
    const update: UpdateCustomerServiceSubscriptionRequest = {
      schemaVersion: 1,
      quantity: "3",
      reason: "seat increase",
    };
    const action: CustomerSubscriptionLifecycleActionRequest = {
      schemaVersion: 1,
      effectiveOn: "2026-02-01",
      reason: "approved start",
    };
    expect([create.quantity, create.unitPriceMinor, update.quantity]).toEqual(["2", "900000", "3"]);
    expect(action.effectiveOn).toBe("2026-02-01");
  });
});
