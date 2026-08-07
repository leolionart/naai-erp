import { describe, expect, it } from "vitest";

import {
  assertPortableInventoryComplete,
  assertPortableRowOperation,
  createPortableDataPackageManifest,
  hashPortableRows,
} from "./portable-data-package.js";

describe("portable data packages", () => {
  const sheet = {
    resourceType: "parties",
    sheetName: "Parties",
    excluded: false,
    schemaVersion: 1,
    dependencyOrder: 10,
    mutability: "editable",
    headerCount: 3,
    rowCount: 2,
    sha256: "b".repeat(64),
  } as const;

  it("builds a complete deterministic inventory manifest", () => {
    const manifest = createPortableDataPackageManifest({
      packageId: "pkg-1",
      organizationId: "org-naai",
      exportedAt: "2026-08-07T16:00:00.000Z",
      asOf: "2026-08-07T16:00:00.000Z",
      exportedBy: "user-1",
      workbookSha256: "c".repeat(64),
      sheets: [sheet],
    });
    expect(manifest).toMatchObject({ totalSheetCount: 1, totalRowCount: 2 });
    expect(manifest.packageHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("hashes rows canonically regardless of object key order", () => {
    expect(hashPortableRows([{ id: "1", name: "NAAI" }])).toBe(
      hashPortableRows([{ name: "NAAI", id: "1" }]),
    );
  });

  it("rejects incomplete inventory and unsafe row operations", () => {
    expect(() =>
      createPortableDataPackageManifest({
        packageId: "pkg-1",
        organizationId: "org-naai",
        exportedAt: "2026-08-07T16:00:00.000Z",
        exportedBy: "user-1",
        asOf: "2026-08-07T16:00:00.000Z",
        workbookSha256: "c".repeat(64),
        sheets: [sheet, sheet],
      }),
    ).toThrow("Duplicate resource type");
    expect(() => assertPortableRowOperation({ operation: "update", stableId: "party-1" })).toThrow(
      "expected resource version",
    );
    expect(() => assertPortableRowOperation({ operation: "create", stableId: "party-1" })).toThrow(
      "must not provide a stable ID",
    );
    expect(() =>
      assertPortableInventoryComplete({
        expectedResourceTypes: ["parties", "projects"],
        sheets: [sheet],
      }),
    ).toThrow("missing resources: projects");
  });
});
