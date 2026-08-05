import { describe, expect, it } from "vitest";
import { agingApi } from "./aging";

describe("agingApi", () => {
  it("builds canonical AR/AP report paths with URL-safe filters", () => {
    expect(
      agingApi.report("ar", {
        asOf: "2026-08-05",
        partyId: "client / 1",
        accountCode: "131-AR",
        bucket: "31_60",
        paymentStatus: "partially_paid",
        includeSettled: true,
        limit: 100,
      }),
    ).toBe(
      "reports/ar-aging?asOf=2026-08-05&partyId=client+%2F+1&accountCode=131-AR&bucket=31_60&paymentStatus=partially_paid&includeSettled=true&limit=100",
    );
    expect(agingApi.report("ap", { asOf: "2026-08-05" })).toBe("reports/ap-aging?asOf=2026-08-05");
  });

  it("encodes party and item resource identifiers", () => {
    expect(agingApi.party("ar", "party / 1", { asOf: "2026-08-05" })).toBe(
      "reports/ar-aging/parties/party%20%2F%201?asOf=2026-08-05",
    );
    expect(agingApi.item("ap", "bill / 1", { asOf: "2026-08-05" })).toBe(
      "reports/ap-aging/items/bill%20%2F%201?asOf=2026-08-05",
    );
  });
});
