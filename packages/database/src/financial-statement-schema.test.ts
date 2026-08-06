import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { financialStatementMappingLines, financialStatementMappingVersions } from "./schema.js";

describe("ERP-630 financial statement schema", () => {
  it("keeps mappings organization scoped, versioned, effective-dated, and approved", () => {
    const versions = getTableConfig(financialStatementMappingVersions);
    expect(versions.name).toBe("financial_statement_mapping_versions");
    expect(versions.primaryKeys).toHaveLength(1);
    expect(
      versions.uniqueConstraints.some(
        (constraint) => constraint.name === "financial_statement_mapping_effective_unique",
      ),
    ).toBe(false);
    expect(versions.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "financial_statement_mapping_version_positive",
        "financial_statement_mapping_date_order",
        "financial_statement_mapping_approval_metadata",
      ]),
    );
  });

  it("binds every account mapping line to an immutable mapping version", () => {
    const lines = getTableConfig(financialStatementMappingLines);
    expect(lines.name).toBe("financial_statement_mapping_lines");
    expect(lines.foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "financial_statement_mapping_lines_version_fk",
        "financial_statement_mapping_lines_account_fk",
      ]),
    );
  });
});
