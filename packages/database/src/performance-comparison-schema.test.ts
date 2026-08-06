import { describe, expect, it } from "vitest";
import { planningActualFacts } from "./schema.js";

describe("ERP-620 planning actual fact schema", () => {
  it("registers organization-scoped source-versioned facts", () => {
    expect(planningActualFacts).toBeDefined();
  });
});
