import { describe, expect, it } from "vitest";
import { recordCategory } from "./focused-record-category";

describe("focused record canonical category", () => {
  it("reads the root category projected identically by list and detail", () => {
    expect(recordCategory({ category: "VEHICLE_RENTAL" })).toBe("VEHICLE_RENTAL");
  });

  it("does not invent a category from a detail form default or nested alias", () => {
    expect(recordCategory({ lines: [{ dimensions: { category: "MEAL" } }] })).toBe("");
  });
});
