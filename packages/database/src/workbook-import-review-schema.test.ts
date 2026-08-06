import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { workbookImportReviewRows, workbookImportReviewStatus } from "./schema.js";

describe("workbook import review staging schema", () => {
  it("defines tenant-scoped review rows with stable source identity and review defaults", () => {
    expect(workbookImportReviewStatus.enumValues).toEqual([
      "pending_review",
      "approved",
      "ignored",
      "posted",
    ]);

    const config = getTableConfig(workbookImportReviewRows);
    expect(config.name).toBe("workbook_import_review_rows");
    expect(config.columns.map((column) => column.name)).toEqual([
      "organization_id",
      "id",
      "import_identity",
      "source_identity",
      "workbook",
      "sheet",
      "source_row",
      "kind",
      "proposed_resource_type",
      "proposed_resource_id",
      "status",
      "review_flags",
      "raw_data",
      "mapped_data",
      "resolution",
      "notes",
      "version",
      "created_by",
      "updated_by",
      "created_at",
      "updated_at",
    ]);
    expect(config.primaryKeys[0]?.columns.map((column) => column.name)).toEqual([
      "organization_id",
      "id",
    ]);
    expect(config.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "workbook_import_review_rows_source_unique",
    );
    expect(config.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "workbook_import_review_rows_import_idx",
        "workbook_import_review_rows_status_idx",
      ]),
    );

    const columns = Object.fromEntries(config.columns.map((column) => [column.name, column]));
    expect(columns.status?.default).toBe("pending_review");
    expect(columns.resolution?.default).toEqual({});
    expect(columns.version?.hasDefault).toBe(true);
    expect(columns.version?.getSQLType()).toBe("bigint");
    expect(columns.created_at?.hasDefault).toBe(true);
    expect(columns.updated_at?.hasDefault).toBe(true);
  });
});
