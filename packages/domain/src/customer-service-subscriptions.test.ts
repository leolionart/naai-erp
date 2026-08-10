import { describe, expect, it } from "vitest";
import {
  buildSubscriptionSchedule,
  servicePlanCodeFromName,
  subscriptionNextActions,
  transitionSubscription,
} from "./customer-service-subscriptions.js";

describe("ERP-870 customer subscriptions", () => {
  it("creates a stable ASCII service-plan code from the readable name", () => {
    expect(servicePlanCodeFromName("  Dịch vụ quản trị website  ")).toBe(
      "DICH-VU-QUAN-TRI-WEBSITE",
    );
    expect(servicePlanCodeFromName("Cloud & Hosting")).toBe("CLOUD-HOSTING");
    expect(servicePlanCodeFromName("***")).toBe("SERVICE-PLAN");
  });
  it("keeps lifecycle transitions typed", () => {
    expect(transitionSubscription("draft", "activate")).toBe("active");
    expect(transitionSubscription("active", "pause")).toBe("paused");
    expect(transitionSubscription("paused", "resume")).toBe("active");
    expect(() => transitionSubscription("cancelled", "activate")).toThrow(
      "SUBSCRIPTION_TRANSITION_INVALID",
    );
    expect(subscriptionNextActions("active")).toEqual(["pause", "cancel", "expire"]);
  });

  it("produces deterministic exact-money schedule without accounting effects", () => {
    const periods = buildSubscriptionSchedule({
      startsOn: "2026-01-31",
      previewThrough: "2026-04-30",
      lifecycle: "active",
      recurrence: { frequency: "month", interval: 1, billingDay: 31 },
      quantity: "2",
      unitPriceMinor: "1500000",
      currency: "VND",
    });
    expect(periods.map((x) => [x.serviceStartsOn, x.billingOn, x.scheduledValueMinor])).toEqual([
      ["2026-01-31", "2026-01-31", "3000000"],
      ["2026-02-28", "2026-02-28", "3000000"],
      ["2026-03-28", "2026-03-31", "3000000"],
      ["2026-04-28", "2026-04-30", "3000000"],
    ]);
  });
  it.each(["paused", "cancelled", "expired"] as const)(
    "suppresses future periods for %s",
    (lifecycle) => {
      expect(
        buildSubscriptionSchedule({
          startsOn: "2026-01-01",
          previewThrough: "2026-12-31",
          lifecycle,
          recurrence: { frequency: "month", interval: 1, billingDay: 1 },
          quantity: "1",
          unitPriceMinor: "1",
          currency: "VND",
        }),
      ).toEqual([]);
    },
  );
  it("truncates at endsOn and handles leap month boundaries", () => {
    const periods = buildSubscriptionSchedule({
      startsOn: "2024-01-31",
      endsOn: "2024-03-15",
      previewThrough: "2024-12-31",
      lifecycle: "active",
      recurrence: { frequency: "month", interval: 1, billingDay: 31 },
      quantity: "1",
      unitPriceMinor: "100",
      currency: "VND",
    });
    expect(periods.map((x) => [x.serviceStartsOn, x.serviceEndsOn, x.billingOn])).toEqual([
      ["2024-01-31", "2024-02-28", "2024-01-31"],
      ["2024-02-29", "2024-03-15", "2024-02-29"],
    ]);
  });
  it("rejects invalid exact values, ranges and recurrence", () => {
    const base = {
      startsOn: "2026-02-01",
      previewThrough: "2026-03-01",
      lifecycle: "active" as const,
      recurrence: { frequency: "month" as const, interval: 1, billingDay: 1 },
      quantity: "1",
      unitPriceMinor: "1",
      currency: "VND",
    };
    expect(() => buildSubscriptionSchedule({ ...base, unitPriceMinor: "1.5" })).toThrow(
      "SUBSCRIPTION_MONEY_INVALID",
    );
    expect(() => buildSubscriptionSchedule({ ...base, quantity: "0" })).toThrow(
      "SUBSCRIPTION_QUANTITY_INVALID",
    );
    expect(() => buildSubscriptionSchedule({ ...base, endsOn: "2026-01-31" })).toThrow(
      "SUBSCRIPTION_DATE_RANGE_INVALID",
    );
    expect(() =>
      buildSubscriptionSchedule({ ...base, recurrence: { ...base.recurrence, interval: 0 } }),
    ).toThrow("SUBSCRIPTION_RECURRENCE_INVALID");
  });
});
