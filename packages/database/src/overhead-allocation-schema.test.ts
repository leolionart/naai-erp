import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  overheadAllocationPolicies,
  overheadAllocationRuns,
  overheadAllocationSplits,
  overheadSourcePoolItems,
  overheadSourcePools,
} from "./schema.js";
describe("ERP-530 overhead schema", () => {
  it("uses tenant composite keys and exclusive source claims", () => {
    for (const table of [
      overheadAllocationPolicies,
      overheadSourcePools,
      overheadSourcePoolItems,
      overheadAllocationRuns,
      overheadAllocationSplits,
    ]) {
      const c = getTableConfig(table);
      expect(c.columns.some((x) => x.name === "organization_id")).toBe(true);
      expect(c.primaryKeys.length).toBeGreaterThan(0);
    }
    const poolItems = getTableConfig(overheadSourcePoolItems);
    expect(
      poolItems.uniqueConstraints.some((x) => x.name === "overhead_source_item_exclusive"),
    ).toBe(true);
  });
});
