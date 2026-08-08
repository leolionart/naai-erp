import ExcelJS from "exceljs";
import type { FilteredDocumentExportQueryContract } from "@naai-erp/contracts";

type Row = Record<string, unknown>;

const text = (value: unknown) => (value == null ? "" : String(value));
const money = (value: unknown) => {
  const parsed = Number.parseInt(text(value) || "0", 10);
  return Number.isSafeInteger(parsed) ? parsed : 0;
};
const date = (value: unknown) => {
  const parsed = new Date(`${text(value)}T00:00:00.000Z`);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
};
const rate = (net: number, tax: number, taxCode: unknown) => {
  const fromCode = text(taxCode).match(/(\d+(?:\.\d+)?)\s*%?$/)?.[1];
  if (fromCode) return Number(fromCode);
  return net ? Number(((tax / net) * 100).toFixed(2)) : 0;
};

const addRawSheet = (book: ExcelJS.Workbook, name: string, rows: Row[]) => {
  const sheet = book.addWorksheet(name, { properties: { defaultRowHeight: 20 } });
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  sheet.columns = columns.map((key) => ({
    key,
    header: key,
    width: Math.min(60, Math.max(14, key.length + 2)),
  }));
  for (const source of rows) {
    const row = sheet.addRow(source);
    row.alignment = { vertical: "top", wrapText: true };
  }
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17365D" } };
  header.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  if (columns.length)
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
};

export function createAccountingListWorkbook(input: {
  kind: "sales_invoices" | "purchase_invoices_and_expenses";
  organizationId: string;
  organizationName: string;
  filters: FilteredDocumentExportQueryContract;
  records: Row[];
  lines: Row[];
}) {
  const book = new ExcelJS.Workbook();
  book.creator = "NAAI ERP";
  book.created = new Date("2000-01-01T00:00:00.000Z");
  book.modified = book.created;
  book.calcProperties.fullCalcOnLoad = false;
  const sales = input.kind === "sales_invoices";
  const sheet = book.addWorksheet(sales ? "Bảng kê bán ra" : "Bảng kê mua vào", {
    properties: { defaultRowHeight: 20 },
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  sheet.mergeCells("A1:P1");
  sheet.getCell("A1").value =
    `BẢNG KÊ HÓA ĐƠN CHỨNG TỪ HÀNG HÓA, DỊCH VỤ ${sales ? "BÁN RA" : "MUA VÀO"}`;
  sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF17365D" } };
  sheet.mergeCells("A2:P2");
  sheet.getCell("A2").value = `Kỳ dữ liệu: ${input.filters.startsOn} đến ${input.filters.endsOn}`;
  sheet.mergeCells("A3:H3");
  sheet.getCell("A3").value = `Tên cơ sở kinh doanh: ${input.organizationName}`;
  sheet.mergeCells("I3:P3");
  sheet.getCell("I3").value = `Mã tổ chức ERP: ${input.organizationId}`;
  const headers = [
    "STT",
    "Loại chứng từ",
    "Số chứng từ",
    "Ngày chứng từ",
    "Seri HĐ",
    "Số HĐ",
    "Ngày HĐ",
    "Tên đối tác",
    "MST",
    "Mặt hàng",
    "Doanh số chưa thuế",
    "Thuế suất (%)",
    "Thuế GTGT",
    "Tổng thanh toán",
    "Trạng thái",
    "Ghi chú",
  ];
  sheet.addRow([]);
  sheet.addRow(headers);
  const headerRow = sheet.getRow(5);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17365D" } };
  headerRow.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  headerRow.height = 34;
  const linesByRecord = new Map<string, Row[]>();
  for (const line of input.lines) {
    const key = text(line.recordId);
    linesByRecord.set(key, [...(linesByRecord.get(key) ?? []), line]);
  }
  let sequence = 0;
  for (const record of input.records) {
    const recordLines = linesByRecord.get(text(record.id)) ?? [{}];
    for (const line of recordLines) {
      sequence += 1;
      const lineNet = line.netMinor == null ? money(record.netMinor) : money(line.netMinor);
      const lineTax = line.taxMinor == null ? money(record.taxMinor) : money(line.taxMinor);
      const lineGross = line.grossMinor == null ? money(record.grossMinor) : money(line.grossMinor);
      const invoicePresent = text(record.invoicePresence) === "present";
      const row = sheet.addRow([
        sequence,
        text(record.sourceType),
        text(record.id),
        date(record.recordDate),
        invoicePresent ? text(record.series) || null : null,
        invoicePresent ? text(record.documentNumber) || null : null,
        invoicePresent ? date(record.recordDate) : null,
        text(record.partyName) || null,
        text(record.partyTaxId) || null,
        text(line.description || record.businessPurpose) || null,
        lineNet,
        rate(lineNet, lineTax, line.taxCode),
        lineTax,
        lineGross,
        text(record.state) || null,
        invoicePresent ? text(record.reason) || null : "Chi phí không có hóa đơn",
      ]);
      row.getCell(4).numFmt = "dd/mm/yyyy";
      row.getCell(7).numFmt = "dd/mm/yyyy";
      for (const column of [11, 13, 14]) row.getCell(column).numFmt = "#,##0;[Red](#,##0)";
      row.getCell(12).numFmt = "0.##";
      row.alignment = { vertical: "top", wrapText: true };
    }
  }
  const totalRowNumber = sheet.rowCount + 1;
  const total = sheet.addRow(["TỔNG CỘNG"]);
  sheet.mergeCells(`A${totalRowNumber}:J${totalRowNumber}`);
  total.getCell(11).value = { formula: `SUM(K6:K${totalRowNumber - 1})` };
  total.getCell(13).value = { formula: `SUM(M6:M${totalRowNumber - 1})` };
  total.getCell(14).value = { formula: `SUM(N6:N${totalRowNumber - 1})` };
  total.font = { bold: true };
  total.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9EAF7" } };
  for (const column of [11, 13, 14]) total.getCell(column).numFmt = "#,##0;[Red](#,##0)";
  const widths = [7, 18, 24, 14, 14, 14, 14, 34, 18, 44, 20, 16, 18, 20, 16, 32];
  widths.forEach((width, index) => (sheet.getColumn(index + 1).width = width));
  sheet.views = [{ state: "frozen", ySplit: 5 }];
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: 16 } };
  sheet.pageSetup.printTitlesRow = "1:5";
  sheet.pageSetup.margins = {
    left: 0.25,
    right: 0.25,
    top: 0.5,
    bottom: 0.5,
    header: 0.2,
    footer: 0.2,
  };

  const summary = [
    {
      exportKind: input.kind,
      organizationId: input.organizationId,
      organizationName: input.organizationName,
      startsOn: input.filters.startsOn,
      endsOn: input.filters.endsOn,
      recordCount: input.records.length,
      scheduleRowCount: sequence,
    },
  ];
  addRawSheet(book, "Summary", summary);
  addRawSheet(book, "Records", input.records);
  addRawSheet(book, "Lines", input.lines);
  addRawSheet(
    book,
    "Filters",
    Object.entries(input.filters).map(([field, value]) => ({ field, value })),
  );
  return book;
}
