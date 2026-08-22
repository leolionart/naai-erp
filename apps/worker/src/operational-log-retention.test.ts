import { describe, expect, it } from "vitest";
import { parseOperationalLogRetentionDays } from "./pg-outbound-delivery-store.js";

describe("ERP-917 operational log retention", () => {
  it("defaults to 30 days", () => expect(parseOperationalLogRetentionDays(undefined)).toBe(30));
  it("accepts a bounded configured duration", () =>
    expect(parseOperationalLogRetentionDays("90")).toBe(90));
  it.each(["0", "366", "invalid"])("falls back for unsafe value %s", (value) => {
    expect(parseOperationalLogRetentionDays(value)).toBe(30);
  });
});
