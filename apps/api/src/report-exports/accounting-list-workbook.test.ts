import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { createAccountingListWorkbook } from "./accounting-list-workbook.js";

describe("ERP-851 accountant-style list workbook", () => {
  it("creates an accountant schedule while retaining machine-readable source sheets", async () => {
    const created = createAccountingListWorkbook({
      kind: "sales_invoices",
      organizationId: "naai",
      organizationName: "CÔNG TY TNHH NAAI STUDIO",
      filters: { startsOn: "2026-01-01", endsOn: "2026-12-31", format: "xlsx" },
      records: [
        {
          id: "invoice-1",
          sourceType: "sales_invoice",
          invoicePresence: "present",
          state: "issued",
          documentNumber: "8",
          series: "C26TNT",
          partyName: "CÔNG TY CỔ PHẦN BM WINDOWS",
          partyTaxId: "0313919539",
          recordDate: "2026-05-05",
          netMinor: "5687500",
          taxMinor: "455000",
          grossMinor: "6142500",
        },
      ],
      lines: [
        {
          recordId: "invoice-1",
          lineNumber: "1",
          description: "Dịch vụ thiết kế",
          netMinor: "5687500",
          taxMinor: "455000",
          grossMinor: "6142500",
          taxCode: "VAT8",
        },
      ],
    });
    const bytes = await created.xlsx.writeBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as never);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Bảng kê bán ra",
      "Summary",
      "Records",
      "Lines",
      "Filters",
    ]);
    const schedule = workbook.getWorksheet("Bảng kê bán ra")!;
    expect(schedule.getCell("A1").value).toContain("BÁN RA");
    expect(schedule.getCell("H6").value).toBe("CÔNG TY CỔ PHẦN BM WINDOWS");
    expect(schedule.getCell("I6").value).toBe("0313919539");
    expect(schedule.getCell("L6").value).toBe(8);
    expect(schedule.getCell("K7").value).toMatchObject({ formula: "SUM(K6:K6)" });
    expect(schedule.autoFilter).toBeTruthy();
  });

  it("labels non-invoice expenses without inventing invoice identity", () => {
    const workbook = createAccountingListWorkbook({
      kind: "purchase_invoices_and_expenses",
      organizationId: "naai",
      organizationName: "NAAI",
      filters: { startsOn: "2026-01-01", endsOn: "2026-12-31", format: "xlsx" },
      records: [
        {
          id: "expense-1",
          sourceType: "expense",
          invoicePresence: "missing",
          recordDate: "2026-05-01",
          businessPurpose: "Chi phí vận hành",
          netMinor: "100000",
          taxMinor: "0",
          grossMinor: "100000",
        },
      ],
      lines: [],
    });
    const schedule = workbook.getWorksheet("Bảng kê mua vào")!;
    expect(schedule.getCell("E6").value).toBeNull();
    expect(schedule.getCell("F6").value).toBeNull();
    expect(schedule.getCell("P6").value).toBe("Chi phí không có hóa đơn");
  });
});
