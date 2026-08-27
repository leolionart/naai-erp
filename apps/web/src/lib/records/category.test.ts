import { describe, expect, it } from "vitest";
import { recordCategory } from "./category";

describe("record category presentation", () => {
  it("prefers the root projection when list and detail both provide it", () => {
    expect(
      recordCategory({ category: "VEHICLE_RENTAL", lines: [{ dimensions: { category: "MEAL" } }] }),
    ).toBe("VEHICLE_RENTAL");
  });

  it("falls back to line dimensions when the list root is absent", () => {
    expect(recordCategory({ lines: [{ dimensions: { category: "MEAL" } }] })).toBe("MEAL");
  });

  it("falls back to allocation dimensions when line dimensions are empty", () => {
    expect(
      recordCategory({
        category: null,
        lines: [{ dimensions: {}, allocations: [{ dimensions: { category: "VEHICLE_RENTAL" } }] }],
      }),
    ).toBe("VEHICLE_RENTAL");
  });

  it("accepts camelCase and snake_case line category aliases", () => {
    expect(recordCategory({ lines: [{ expense_category_code: "OFFICE_SUPPLIES" }] })).toBe(
      "OFFICE_SUPPLIES",
    );
    expect(recordCategory({ lines: [{ categoryCode: "DOMAIN_HOSTING" }] })).toBe("DOMAIN_HOSTING");
  });
});
