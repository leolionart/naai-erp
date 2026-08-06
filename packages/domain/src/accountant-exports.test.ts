import { describe, expect, it } from "vitest";
import {
  createAccountantExportManifest,
  createAccountantWorkbook,
  workbookSheetToCsv,
} from "./accountant-exports.js";
import { createReportSnapshot } from "./report-snapshots.js";
const snapshot = (mapped = true) =>
  createReportSnapshot({
    id: "snapshot-1",
    version: 1,
    organizationId: "org-naai",
    reportKind: "profit_and_loss",
    period: { asOfDate: "2026-08-31" },
    accountingBasis: "accrual_management",
    formulaVersions: { pnl: "v1" },
    ledgerCutoff: {
      throughDate: "2026-08-31",
      maxPostedAt: "2026-08-31T23:59:00Z",
      journalCount: 1,
      lineCount: 2,
      sourceFingerprint: "b".repeat(64),
    },
    mappings: [
      {
        sourceKey: "511",
        ...(mapped ? { targetKey: "revenue" } : {}),
        status: mapped ? "mapped" : "unmapped",
      },
    ],
    unresolvedItems: [],
    request: { asOfDate: "2026-08-31" },
    result: { amountMinor: "100" },
    createdAt: "2026-09-01T00:00:00Z",
    createdBy: "user-1",
  });
describe("ERP-650 accountant exports", () => {
  it("creates format-neutral workbooks and stable manifests", () => {
    const workbook = createAccountantWorkbook({
      snapshot: snapshot(),
      title: "August P&L",
      currency: "vnd",
      sheets: [
        {
          key: "pnl",
          name: "P&L",
          columns: [
            { key: "label", label: "Label" },
            { key: "amount", label: "Amount", format: "money_minor" },
          ],
          rows: [
            { label: { value: "Revenue, net" }, amount: { value: "100", format: "money_minor" } },
          ],
        },
      ],
    });
    expect(workbookSheetToCsv(workbook.sheets[0]!)).toBe('Label,Amount\r\n"Revenue, net",100\r\n');
    expect(createAccountantExportManifest(workbook, "csv").workbookHash).toHaveLength(64);
    expect(createAccountantExportManifest(workbook, "xlsx").workbookHash).toBe(
      createAccountantExportManifest(workbook, "csv").workbookHash,
    );
  });
  it("allows review workbooks but never labels their manifest final", () => {
    const workbook = createAccountantWorkbook({
      snapshot: snapshot(false),
      title: "Draft",
      currency: "VND",
      sheets: [{ key: "x", name: "X", columns: [{ key: "x", label: "X" }], rows: [] }],
    });
    expect(createAccountantExportManifest(workbook, "xlsx")).toMatchObject({
      snapshotReadiness: "review_required",
      isFinal: false,
    });
  });
});
