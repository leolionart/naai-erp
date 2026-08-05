import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  milestoneAcceptances,
  projectBudgetLines,
  projectBudgetVersions,
  revenueRecognitionEvents,
  revenueRecognitionPolicies,
  scopeChanges,
} from "./schema.js";
describe("ERP-520 schema", () => {
  it("registers all project economics resources with tenant composite keys", () => {
    for (const table of [
      scopeChanges,
      projectBudgetVersions,
      projectBudgetLines,
      revenueRecognitionPolicies,
      milestoneAcceptances,
      revenueRecognitionEvents,
    ]) {
      const config = getTableConfig(table);
      expect(config.columns.some((column) => column.name === "organization_id")).toBe(true);
      expect(config.primaryKeys.length).toBeGreaterThan(0);
    }
  });
});
