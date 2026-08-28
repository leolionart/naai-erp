import ExcelJS from "exceljs";
import type { FilteredDocumentExportQueryContract } from "@naai-erp/contracts";

type Row = Record<string, unknown>;

const text = (value: unknown) => (value == null ? "" : String(value));
const money = (value: unknown) => {
  const raw = text(value).trim() || "0";
  if (!/^-?\d+$/.test(raw)) throw new Error(`Invalid exact money amount: ${raw}`);
  const parsed = BigInt(raw);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER) || parsed < BigInt(Number.MIN_SAFE_INTEGER))
    throw new Error(`Money amount exceeds Excel exact-integer range: ${raw}`);
  return Number(parsed);
};
const optionalMoney = (value: unknown) =>
  value == null || text(value).trim() === "" ? null : money(value);
const date = (value: unknown) => {
  const parsed = new Date(`${text(value)}T00:00:00.000Z`);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
};
const rate = (net: number, tax: number, taxCode: unknown) => {
  const fromCode = text(taxCode).match(/(\d+(?:\.\d+)?)\s*%?$/)?.[1];
  if (fromCode) return Number(fromCode);
  return net ? Number(((tax / net) * 100).toFixed(2)) : 0;
};

const RAW_HEADERS = [
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
] as const;

const addForm78Sheet = (
  book: ExcelJS.Workbook,
  input: {
    sales: boolean;
    organizationName: string;
    records: Row[];
  },
) => {
  const sheet = book.addWorksheet(input.sales ? "BRTT78" : "MVTT78", {
    properties: { defaultRowHeight: 20 },
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  sheet.addRow([]);
  sheet.addRow([]);
  sheet.addRow([...RAW_HEADERS]);
  const header = sheet.getRow(3);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17365D" } };
  header.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  header.height = 64;

  const invoiceRecords = input.records.filter(
    (record) => text(record.invoicePresence) === "present",
  );
  invoiceRecords.forEach((record, index) => {
    const recordDate = date(record.recordDate);
    const invoicePresent = text(record.invoicePresence) === "present";
    const quarter = recordDate ? `Q${Math.floor(recordDate.getUTCMonth() / 3) + 1}` : null;
    const month = recordDate ? recordDate.getUTCMonth() + 1 : null;
    const partyName = text(record.partyName) || null;
    const partyTaxId = text(record.partyTaxId) || null;
    const partyAddress = text(record.partyAddress) || null;
    const orgTaxId = text(record.organizationTaxId) || null;
    const orgAddress = text(record.organizationAddress) || null;
    const row = sheet.addRow([
      index + 1,
      invoicePresent ? text(record.templateSymbol) || null : null,
      invoicePresent ? text(record.series) || null : null,
      invoicePresent ? text(record.documentNumber) || null : null,
      invoicePresent ? recordDate : null,
      input.sales ? orgTaxId : partyTaxId,
      input.sales ? input.organizationName : partyName,
      input.sales ? partyTaxId : orgTaxId,
      input.sales ? partyName : input.organizationName,
      input.sales ? partyAddress : orgAddress,
      money(record.netMinor),
      money(record.taxMinor),
      optionalMoney(record.discountMinor),
      optionalMoney(record.feeMinor),
      money(record.grossMinor),
      text(record.currency) || "VND",
      record.exchangeRate == null || text(record.exchangeRate).trim() === ""
        ? 1
        : (() => {
            const parsed = Number(text(record.exchangeRate));
            if (!Number.isFinite(parsed) || parsed <= 0)
              throw new Error(`Invalid exchange rate: ${text(record.exchangeRate)}`);
            return parsed;
          })(),
      text(record.invoiceState || record.state) || null,
      text(record.invoiceCheckResult) || null,
      quarter,
      month,
    ]);
    row.getCell(5).numFmt = "dd/mm/yyyy";
    for (const column of [11, 12, 13, 14, 15]) row.getCell(column).numFmt = "#,##0;[Red](#,##0)";
    row.getCell(17).numFmt = "0.########";
    row.alignment = { vertical: "top", wrapText: true };
  });

  const lastDataRow = Math.max(4, sheet.rowCount);
  for (const column of [11, 12, 15]) {
    const letter = sheet.getColumn(column).letter;
    sheet.getCell(2, column).value = { formula: `SUBTOTAL(9,${letter}4:${letter}${lastDataRow})` };
    sheet.getCell(2, column).numFmt = "#,##0;[Red](#,##0)";
    sheet.getCell(2, column).font = { bold: true };
  }
  const widths = [
    7, 16, 16, 15, 14, 22, 38, 22, 38, 38, 20, 18, 22, 16, 20, 14, 14, 20, 30, 10, 10,
  ];
  widths.forEach((width, index) => (sheet.getColumn(index + 1).width = width));
  sheet.views = [{ state: "frozen", ySplit: 3 }];
  sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: lastDataRow, column: 21 } };
  sheet.pageSetup.printTitlesRow = "1:3";

  for (let rowNumber = 4; rowNumber <= sheet.rowCount; rowNumber += 1) {
    for (const column of [2, 6, 8, 10, 13, 14, 19]) {
      const cell = sheet.getCell(rowNumber, column);
      if (cell.value == null)
        cell.note =
          "Để trống vì API nguồn hiện chưa cung cấp trường này; NAAI ERP không tự suy đoán.";
    }
  }
  return sheet;
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
  addForm78Sheet(book, {
    sales,
    organizationName: input.organizationName,
    records: input.records,
  });
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
        invoicePresent
          ? [text(record.reason), text(record.correctionStatus)].filter(Boolean).join("; ") || null
          : [
              "Chi phí không có hóa đơn",
              text(record.correctionStatus),
              text(record.originalExpenseId) ? `Gốc: ${text(record.originalExpenseId)}` : null,
            ]
              .filter(Boolean)
              .join("; "),
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
