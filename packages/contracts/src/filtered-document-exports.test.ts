import { describe, expect, it } from "vitest";
import {
  FILTERED_DOCUMENT_EXPORT_CONTRACT_VERSION,
  type FilteredDocumentExportContract,
} from "./filtered-document-exports.js";

describe("filtered document export contracts", () => {
  it("keeps invoice and expense axes explicit with exact minor-unit totals", () => {
    const result: FilteredDocumentExportContract = {
      schemaVersion: FILTERED_DOCUMENT_EXPORT_CONTRACT_VERSION,
      exportKind: "purchase_invoices_and_expenses",
      organizationId: "org-naai",
      generatedAt: "2026-08-08T00:00:00.000Z",
      generatedBy: "accountant-1",
      filters: {
        startsOn: "2026-01-01",
        endsOn: "2026-12-31",
        format: "xlsx",
        invoicePresence: "all",
      },
      currency: "VND",
      recordCount: 2,
      netMinor: "20000000",
      taxMinor: "2000000",
      grossMinor: "22000000",
      contentSha256: "a".repeat(64),
      filename: "purchase-expense.xlsx",
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sheets: ["summary", "records", "lines", "filters"].map((key) => ({
        key: key as "summary" | "records" | "lines" | "filters",
        name: key,
        rowCount: 1,
        sha256: "b".repeat(64),
      })),
    };
    expect(result.grossMinor).toBe("22000000");
    expect(result.exportKind).not.toBe("sales_invoices");
  });
});
