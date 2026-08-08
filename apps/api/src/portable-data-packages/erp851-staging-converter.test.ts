import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { ERP851_STAGING_SHA256, convertErp851StagingWorkbook } from "./erp851-staging-converter.js";

const source = "../../outputs/erp-851/naai-normalized-import-staging.xlsx";
const organizationId = "00000000-0000-4000-8000-000000000851";
const mapping = {
  purchaseControlAccountCode: "reviewed-ap",
  purchasePrimaryAccountCode: "reviewed-purchase-expense",
  purchaseTaxAccountCode: "reviewed-input-vat",
  expenseOwnerCounterAccountCode: "reviewed-owner-payable",
  expenseCompanyCounterAccountCode: "reviewed-company-bank",
  expensePostingAccountCode: "reviewed-management-expense",
};

describe("ERP-851 staging converter", () => {
  it("verifies the source SHA and preserves reviewed controls and explicit exclusions", async () => {
    const result = await convertErp851StagingWorkbook({
      sourceWorkbookPath: source,
      organizationId,
      reviewedAccountMapping: mapping,
    });
    expect(result.sourceWorkbookSha256).toBe(ERP851_STAGING_SHA256);
    expect(result.controls).toEqual({
      parties: 75,
      projects: 35,
      purchaseInvoices: 121,
      expenses: 127,
      expensesImportable: 112,
      revenueActivitiesExcluded: 45,
      brokenPurchaseHeadersExcluded: 2,
      incompletePurchaseHeadersExcluded: 4,
      sourceExceptionsExcluded: 9,
      purchaseGrossMinor: "232736813",
      expenseGrossMinor: "393376715",
    });
    expect(result.manifest.totalRowCount).toBe(343);
    expect(
      result.manifest.sheets.find(
        (item) => item.resourceType === "revenue_activities_source_inventory",
      ),
    ).toMatchObject({ excluded: true, rowCount: 0 });
    expect(
      result.manifest.sheets.find((item) => item.resourceType === "erp851_source_exceptions")
        ?.exclusionReason,
    ).toContain("2 broken purchase headers");
  });

  it("produces deterministic package bytes with portable v1 schemas and reviewed account mappings", async () => {
    const first = await convertErp851StagingWorkbook({
      sourceWorkbookPath: source,
      organizationId,
      reviewedAccountMapping: mapping,
    });
    const second = await convertErp851StagingWorkbook({
      sourceWorkbookPath: source,
      organizationId,
      reviewedAccountMapping: mapping,
    });
    expect(createHash("sha256").update(first.content).digest("hex")).toBe(
      createHash("sha256").update(second.content).digest("hex"),
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(first.content as never);
    expect(workbook.getWorksheet("parties")?.rowCount).toBe(76);
    expect(workbook.getWorksheet("projects")?.rowCount).toBe(36);
    expect(workbook.getWorksheet("purchase_invoices")?.rowCount).toBe(122);
    expect(workbook.getWorksheet("expenses")?.rowCount).toBe(113);
    expect(workbook.getWorksheet("purchase_invoices")?.getCell("P2").value).toBe("reviewed-ap");
    const projectSheet = workbook.getWorksheet("projects")!;
    const projectHeaders = (projectSheet.getRow(1).values as unknown[]).map(String);
    expect(projectSheet.getRow(2).getCell(projectHeaders.indexOf("contract_type")).value).toBe(
      "fixed_fee",
    );
    const projectRelationshipsColumn = projectHeaders.indexOf("relationships");
    projectSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const relationships = JSON.parse(row.getCell(projectRelationshipsColumn).text) as {
        client_party_id?: string;
      };
      expect(relationships.client_party_id).toBeTruthy();
      expect(row.getCell(projectHeaders.indexOf("owner_user_id")).text).toBe("local-owner-actor");
    });
    const invoiceSheet = workbook.getWorksheet("purchase_invoices")!;
    const headers = (invoiceSheet.getRow(1).values as unknown[]).map(String);
    const documentNumberColumn = headers.indexOf("document_number");
    const relationshipsColumn = headers.indexOf("relationships");
    const references = new Set<string>();
    invoiceSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const relationships = JSON.parse(row.getCell(relationshipsColumn).text) as {
        party_id?: string;
      };
      const key = `${relationships.party_id}\u0000${row.getCell(documentNumberColumn).text}`;
      expect(references.has(key)).toBe(false);
      references.add(key);
    });
  });

  it("does not invent account mappings when none were reviewed", async () => {
    const result = await convertErp851StagingWorkbook({
      sourceWorkbookPath: source,
      organizationId,
    });
    expect(
      result.manifest.sheets.find((item) => item.resourceType === "commercial_documents"),
    ).toMatchObject({ excluded: true, rowCount: 0 });
    expect(
      result.manifest.sheets.find((item) => item.resourceType === "expenses")?.exclusionReason,
    ).toContain("reviewed funding counter-account");
    expect(result.manifest.totalRowCount).toBe(110);
  });
});
