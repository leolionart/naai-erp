import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../../../db/migrations/0051_remove_timesheet_workforce.sql",
  import.meta.url,
);

const obsoleteTables = [
  "overhead_allocation_splits",
  "overhead_allocation_runs",
  "overhead_source_pool_items",
  "overhead_source_pools",
  "overhead_allocation_policies",
  "direct_cost_allocation_splits",
  "direct_cost_allocations",
  "project_cost_items",
  "timesheet_adjustments",
  "timesheet_cost_snapshots",
  "timesheet_entries",
  "timesheets",
  "labor_cost_rates",
  "workforce_capacity_versions",
  "workforce_profiles",
] as const;

const canonicalTables = [
  "journal_entries",
  "journal_lines",
  "expenses",
  "expense_lines",
  "expense_allocations",
  "commercial_documents",
  "commercial_document_lines",
  "commercial_document_allocations",
] as const;

describe("ERP-905 obsolete cost-system removal migration", () => {
  it("drops the complete obsolete table set without cascading into canonical accounting sources", async () => {
    const sql = await readFile(migrationUrl, "utf8");

    for (const table of obsoleteTables) {
      expect(sql).toContain(`DROP TABLE IF EXISTS ${table};`);
    }
    expect(sql.match(/DROP TABLE IF EXISTS/g)).toHaveLength(obsoleteTables.length);
    expect(sql).not.toMatch(/\bCASCADE\b/i);

    for (const table of canonicalTables) {
      expect(sql).not.toContain(`DROP TABLE IF EXISTS ${table}`);
      expect(sql).not.toContain(`DELETE FROM ${table}`);
      expect(sql).not.toContain(`TRUNCATE ${table}`);
      expect(sql).not.toContain(`UPDATE ${table}`);
    }
  });
});
