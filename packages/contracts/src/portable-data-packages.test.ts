import { describe, expect, it } from "vitest";

import {
  PORTABLE_DATA_PACKAGE_HASH_ALGORITHM,
  PORTABLE_DATA_PACKAGE_SCHEMA_VERSION,
  type PortableDataPackageManifestContract,
  type PortableDryRunResultContract,
} from "./portable-data-packages.js";

describe("portable data package contracts", () => {
  it("versions the complete package inventory and hashes", () => {
    const manifest: PortableDataPackageManifestContract = {
      schemaVersion: PORTABLE_DATA_PACKAGE_SCHEMA_VERSION,
      packageId: "package-1",
      organizationId: "org-naai",
      exportedAt: "2026-08-07T16:00:00.000Z",
      asOf: "2026-08-07T16:00:00.000Z",
      exportedBy: "user-1",
      sourceSystem: "naai-erp",
      sourceApiVersion: "v1",
      hashAlgorithm: PORTABLE_DATA_PACKAGE_HASH_ALGORITHM,
      workbookSha256: "d".repeat(64),
      sheets: [
        {
          resourceType: "parties",
          sheetName: "Parties",
          excluded: false,
          schemaVersion: 1,
          dependencyOrder: 10,
          mutability: "editable",
          headerCount: 4,
          rowCount: 2,
          sha256: "b".repeat(64),
        },
      ],
      totalSheetCount: 1,
      totalRowCount: 2,
      packageHash: "c".repeat(64),
    };
    expect(manifest.totalRowCount).toBe(2);
  });

  it("makes zero mutation an invariant of dry-run results", () => {
    const result: PortableDryRunResultContract = {
      schemaVersion: 1,
      packageId: "package-1",
      organizationId: "org-naai",
      packageHash: "c".repeat(64),
      dryRun: true,
      mutationCount: 0,
      valid: true,
      totals: { sheets: 0, rows: 0, ready: 0, invalid: 0, conflicts: 0, unchanged: 0 },
      sheetInventory: [],
      rows: [],
    };
    expect(result).toMatchObject({ dryRun: true, mutationCount: 0 });
  });
});
