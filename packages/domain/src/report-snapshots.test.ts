import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  createReportSnapshot,
  sha256Hex,
  verifySnapshotReproduction,
} from "./report-snapshots.js";

const input = {
  id: "snapshot-1",
  version: 1,
  organizationId: "org-naai",
  reportKind: "profit_and_loss" as const,
  period: { startsOn: "2026-08-01", endsOn: "2026-08-31", asOfDate: "2026-08-31" },
  accountingBasis: "accrual_management",
  formulaVersions: { pnl: "profit-and-loss-v1" },
  mappingVersions: { financialStatement: "map-1:1" },
  ledgerCutoff: {
    throughDate: "2026-08-31",
    maxPostedAt: "2026-08-31T16:00:00.000Z",
    journalCount: 2,
    lineCount: 4,
    sourceFingerprint: "a".repeat(64),
  },
  sourceManifest: [{ id: "journal-1", version: 2 }],
  mappings: [
    {
      sourceKey: "511",
      targetKey: "revenue",
      mappingVersionId: "map-1",
      status: "mapped" as const,
    },
  ],
  unresolvedItems: [],
  request: { endsOn: "2026-08-31", startsOn: "2026-08-01" },
  result: { netProfitMinor: 60n },
  createdAt: "2026-09-01T00:00:00.000Z",
  createdBy: "accountant",
};
describe("ERP-650 report snapshots", () => {
  it("uses canonical JSON and SHA-256 vectors", () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
  it("reproduces identical inputs and detects changed result", () => {
    const snapshot = createReportSnapshot(input);
    expect(snapshot.readiness).toBe("final");
    expect(snapshot.mappingVersions).toEqual({ financialStatement: "map-1:1" });
    expect(snapshot.sourceManifest).toEqual([{ id: "journal-1", version: 2 }]);
    expect(
      verifySnapshotReproduction(
        snapshot,
        { startsOn: "2026-08-01", endsOn: "2026-08-31" },
        { netProfitMinor: 60n },
      ).reproducible,
    ).toBe(true);
    expect(
      verifySnapshotReproduction(snapshot, input.request, { netProfitMinor: 61n }).resultMatches,
    ).toBe(false);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(
      createReportSnapshot({
        ...input,
        id: "snapshot-2",
        ledgerCutoff: { ...input.ledgerCutoff, sourceFingerprint: "b".repeat(64) },
      }).snapshotHash,
    ).not.toBe(snapshot.snapshotHash);
  });
  it("blocks final readiness while mappings or issues remain", () => {
    const snapshot = createReportSnapshot({
      ...input,
      mappings: [{ sourceKey: "642", status: "unmapped" }],
      unresolvedItems: [
        {
          code: "tax_unreviewed",
          severity: "critical",
          sourceIds: ["expense-1"],
          message: "Tax review pending",
        },
      ],
    });
    expect(snapshot.readiness).toBe("review_required");
  });
});
