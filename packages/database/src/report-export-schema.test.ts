import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  accountantExportFormat,
  accountantExports,
  accountantExportState,
  reportSnapshotReadiness,
  reportSnapshots,
  reportSnapshotState,
} from "./schema.js";

describe("ERP-650 report snapshot and accountant export schema", () => {
  it("uses append-only snapshot versions with an explicit readiness decision", () => {
    expect(reportSnapshotState.enumValues).toEqual(["captured"]);
    expect(reportSnapshotReadiness.enumValues).toEqual(["final", "review_required"]);

    const snapshots = getTableConfig(reportSnapshots);
    expect(snapshots.name).toBe("report_snapshots");
    expect(snapshots.primaryKeys).toHaveLength(1);
    expect(snapshots.primaryKeys[0]?.columns.map((column) => column.name)).toEqual([
      "organization_id",
      "id",
      "version",
    ]);
    expect(snapshots.foreignKeys.map((key) => key.getName())).toContain(
      "report_snapshots_previous_fk",
    );
    const reproductionBoundary = snapshots.uniqueConstraints.find(
      (constraint) => constraint.name === "report_snapshot_reproduction_unique",
    );
    expect(reproductionBoundary?.columns.map((column) => column.name)).toEqual([
      "organization_id",
      "report_kind",
      "request_hash",
      "source_fingerprint",
    ]);
    expect(snapshots.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "report_snapshot_version_positive",
        "report_snapshot_previous_pair",
        "report_snapshot_period_order",
        "report_snapshot_canonical_objects",
        "report_snapshot_version_objects",
        "report_snapshot_ledger_cutoff_object",
        "report_snapshot_source_manifest_array",
        "report_snapshot_readiness_summary_object",
        "report_snapshot_unresolved_items_array",
      ]),
    );
  });

  it("binds deterministic CSV and XLSX content to one immutable snapshot version", () => {
    expect(accountantExportFormat.enumValues).toEqual(["csv", "xlsx"]);
    expect(accountantExportState.enumValues).toEqual(["generated", "superseded"]);

    const exports = getTableConfig(accountantExports);
    expect(exports.name).toBe("accountant_exports");
    expect(exports.primaryKeys).toHaveLength(1);
    expect(exports.primaryKeys[0]?.columns.map((column) => column.name)).toEqual([
      "organization_id",
      "id",
      "version",
    ]);
    expect(exports.foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining(["accountant_exports_snapshot_fk", "accountant_exports_previous_fk"]),
    );
    expect(exports.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "accountant_export_content_unique",
    );
    expect(exports.columns.find((column) => column.name === "content")?.getSQLType()).toBe("bytea");
    expect(exports.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "accountant_export_version_positive",
        "accountant_export_snapshot_version_positive",
        "accountant_export_previous_pair",
        "accountant_export_manifest_object",
        "accountant_export_content_hash_not_blank",
        "accountant_export_size_nonnegative",
        "accountant_export_supersede_metadata",
      ]),
    );
  });
});
