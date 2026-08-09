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
      "BRTT78",
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

    const raw = workbook.getWorksheet("BRTT78")!;
    expect(raw.getRow(3).values).toEqual([
      undefined,
      "STT",
      "Ký hiệu mẫu số",
      "Ký hiệu hóa đơn",
      "Số hóa đơn",
      "Ngày lập",
      "MST người bán/MST người xuất hàng",
      "Tên người bán/Tên người xuất hàng",
      "MST người mua/MST người nhận hàng",
      "Tên người mua/Tên người nhận hàng",
      "Địa chỉ người mua",
      "Tổng tiền chưa thuế",
      "Tổng tiền thuế",
      "Tổng tiền chiết khấu thương mại",
      "Tổng tiền phí",
      "Tổng tiền thanh toán",
      "Đơn vị tiền tệ",
      "Tỷ giá",
      "Trạng thái hóa đơn",
      "Kết quả kiểm tra hóa đơn",
      "QUÝ",
      "THÁNG",
    ]);
    expect(raw.getCell("D4").value).toBe("8");
    expect(raw.getCell("G4").value).toBe("CÔNG TY TNHH NAAI STUDIO");
    expect(raw.getCell("I4").value).toBe("CÔNG TY CỔ PHẦN BM WINDOWS");
    expect(raw.getCell("K4").value).toBe(5687500);
    expect(raw.getCell("T4").value).toBe("Q2");
    expect(raw.getCell("U4").value).toBe(5);
    expect(raw.getCell("K2").value).toMatchObject({ formula: "SUBTOTAL(9,K4:K4)" });
    expect(raw.getCell("L2").value).toMatchObject({ formula: "SUBTOTAL(9,L4:L4)" });
    expect(raw.getCell("O2").value).toMatchObject({ formula: "SUBTOTAL(9,O4:O4)" });
    expect(raw.getCell("E4").numFmt).toBe("dd/mm/yyyy");
    expect(raw.getCell("K4").numFmt).toBe("#,##0;[Red](#,##0)");
    expect(raw.views[0]).toMatchObject({ state: "frozen", ySplit: 3 });
    expect(raw.autoFilter).toBeTruthy();
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
    expect(workbook.worksheets.map((sheet) => sheet.name)[0]).toBe("MVTT78");
    expect(workbook.getWorksheet("MVTT78")!.getCell("D4").value).toBeNull();
    expect(workbook.getWorksheet("MVTT78")!.getCell("K4").value).toBeNull();
    expect(schedule.getCell("E6").value).toBeNull();
    expect(schedule.getCell("F6").value).toBeNull();
    expect(schedule.getCell("P6").value).toBe("Chi phí không có hóa đơn");
  });

  it("fails instead of rounding money outside Excel's exact integer range", () => {
    expect(() =>
      createAccountingListWorkbook({
        kind: "sales_invoices",
        organizationId: "naai",
        organizationName: "NAAI",
        filters: { startsOn: "2026-01-01", endsOn: "2026-12-31", format: "xlsx" },
        records: [
          {
            id: "invoice-unsafe",
            sourceType: "sales_invoice",
            invoicePresence: "present",
            recordDate: "2026-01-01",
            netMinor: "9007199254740993",
            taxMinor: "0",
            grossMinor: "9007199254740993",
          },
        ],
        lines: [],
      }),
    ).toThrow("Money amount exceeds Excel exact-integer range: 9007199254740993");
  });

  it("keeps the largest safe exact integer unchanged in both raw and normalized sheets", () => {
    const workbook = createAccountingListWorkbook({
      kind: "purchase_invoices_and_expenses",
      organizationId: "naai",
      organizationName: "NAAI",
      filters: { startsOn: "2026-01-01", endsOn: "2026-12-31", format: "xlsx" },
      records: [
        {
          id: "invoice-safe",
          sourceType: "purchase_invoice",
          invoicePresence: "present",
          recordDate: "2026-03-31",
          netMinor: String(Number.MAX_SAFE_INTEGER),
          taxMinor: "0",
          grossMinor: String(Number.MAX_SAFE_INTEGER),
        },
      ],
      lines: [],
    });
    expect(workbook.getWorksheet("MVTT78")!.getCell("K4").value).toBe(Number.MAX_SAFE_INTEGER);
    expect(workbook.getWorksheet("Bảng kê mua vào")!.getCell("K6").value).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });
});
