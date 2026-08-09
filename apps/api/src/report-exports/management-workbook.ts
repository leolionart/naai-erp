import ExcelJS from "exceljs";

export type ManagementRevenueRow = Readonly<{
  date: string;
  sourceType: "sales_invoice" | "revenue_recognition" | "customer_receipt";
  reference: string;
  customerName: string;
  projectName?: string;
  contractReference?: string;
  invoicedMinor: string;
  recognizedMinor: string;
  collectedMinor: string;
  state: string;
}>;

export type ManagementReceivableRow = Readonly<{
  customerName: string;
  documentNumber: string;
  projectName?: string;
  documentDate: string;
  dueDate: string;
  grossMinor: string;
  collectedMinor: string;
  outstandingMinor: string;
  agingBucket: string;
  state: string;
}>;

export type ManagementExpenseRow = Readonly<{
  date: string;
  sourceType: "purchase_invoice" | "expense";
  reference: string;
  supplierOrPayeeName?: string;
  projectName?: string;
  categoryName: string;
  description: string;
  netMinor: string;
  taxMinor: string;
  grossMinor: string;
  fundingSource?: string;
  state: string;
}>;

export type ManagementMonthlyMetricRow = Readonly<{
  month: string;
  invoicedRevenueMinor: string;
  recognizedRevenueMinor: string;
  collectedRevenueMinor: string;
  expenseMinor: string;
  accountingProfitMinor: string;
  receivableMinor: string;
  outputVatMinor: string;
  inputVatMinor: string;
}>;

export type ManagementPlanRow = Readonly<{
  month: string;
  revenueTargetMinor: string;
  forecastRevenueMinor: string;
  actualRevenueMinor: string;
  forecastExpenseMinor: string;
  actualExpenseMinor: string;
  forecastClosingCashMinor?: string;
  actualClosingCashMinor?: string;
  state: string;
}>;

export type ManagementExpenseCategoryRow = Readonly<{
  month: string;
  categoryCode: string;
  categoryName: string;
  amountMinor: string;
}>;

export type ManagementControl = Readonly<{
  name: string;
  value: string;
  status: "pass" | "warning" | "unavailable";
  note: string;
}>;

export type ManagementWorkbookInput = Readonly<{
  organizationId: string;
  organizationName: string;
  startsOn: string;
  endsOn: string;
  asOfDate: string;
  revenue: readonly ManagementRevenueRow[];
  receivables: readonly ManagementReceivableRow[];
  expenses: readonly ManagementExpenseRow[];
  monthlyMetrics: readonly ManagementMonthlyMetricRow[];
  plans: readonly ManagementPlanRow[];
  expenseCategories: readonly ManagementExpenseCategoryRow[];
  controls?: readonly ManagementControl[];
}>;

const HEADER_FILL = "FF17365D";
const TOTAL_FILL = "FFD9EAF7";
const MONEY_FORMAT = "#,##0;[Red](#,##0);-";
const DATE_FORMAT = "dd/mm/yyyy";

const exactMoney = (value: string) => {
  if (!/^-?\d+$/.test(value)) throw new Error(`INVALID_EXACT_AMOUNT:${value}`);
  const amount = Number(value);
  if (!Number.isSafeInteger(amount)) throw new Error(`UNSAFE_EXCEL_AMOUNT:${value}`);
  return amount;
};
const optionalMoney = (value: string | undefined) => (value == null ? null : exactMoney(value));

const typedDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`INVALID_DATE:${value}`);
  const result = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(result.valueOf())) throw new Error(`INVALID_DATE:${value}`);
  return result;
};

const title = (
  sheet: ExcelJS.Worksheet,
  input: ManagementWorkbookInput,
  label: string,
  columns: number,
) => {
  sheet.mergeCells(1, 1, 1, columns);
  sheet.getCell(1, 1).value = label;
  sheet.getCell(1, 1).font = { bold: true, size: 16, color: { argb: HEADER_FILL } };
  sheet.mergeCells(2, 1, 2, columns);
  sheet.getCell(2, 1).value =
    `${input.organizationName} · ${input.startsOn} đến ${input.endsOn} · Chốt ${input.asOfDate}`;
  sheet.getCell(2, 1).font = { italic: true, color: { argb: "FF475569" } };
};

const header = (sheet: ExcelJS.Worksheet, rowNumber: number, labels: readonly string[]) => {
  const row = sheet.getRow(rowNumber);
  row.values = [...labels];
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  row.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  row.height = 32;
  sheet.views = [{ state: "frozen", ySplit: rowNumber }];
  sheet.autoFilter = {
    from: { row: rowNumber, column: 1 },
    to: { row: rowNumber, column: labels.length },
  };
};

const finish = (
  sheet: ExcelJS.Worksheet,
  widths: readonly number[],
  dateColumns: readonly number[],
  moneyColumns: readonly number[],
) => {
  const border: Partial<ExcelJS.Borders> = {
    bottom: { style: "hair", color: { argb: "FFD8E0EA" } },
    right: { style: "hair", color: { argb: "FFE7ECF2" } },
  };
  widths.forEach((width, index) => (sheet.getColumn(index + 1).width = width));
  for (const column of dateColumns) sheet.getColumn(column).numFmt = DATE_FORMAT;
  for (const column of moneyColumns) sheet.getColumn(column).numFmt = MONEY_FORMAT;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 3) {
      row.alignment = { vertical: "top", wrapText: true };
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = border;
      });
    }
  });
  sheet.pageSetup = {
    orientation: "landscape",
    paperSize: 5 as ExcelJS.PaperSize,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 },
  };
  sheet.pageSetup.printTitlesRow = "1:3";
};

const totalRow = (
  sheet: ExcelJS.Worksheet,
  firstDataRow: number,
  moneyColumns: readonly number[],
) => {
  const rowNumber = sheet.rowCount + 1;
  const row = sheet.addRow(["TỔNG CỘNG"]);
  for (const column of moneyColumns) {
    const letter = sheet.getColumn(column).letter;
    row.getCell(column).value = {
      formula:
        firstDataRow < rowNumber ? `SUM(${letter}${firstDataRow}:${letter}${rowNumber - 1})` : "0",
    };
    row.getCell(column).numFmt = MONEY_FORMAT;
  }
  row.font = { bold: true };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } };
};

export function createManagementWorkbook(input: ManagementWorkbookInput) {
  const book = new ExcelJS.Workbook();
  book.creator = "NAAI ERP";
  book.created = new Date("2000-01-01T00:00:00.000Z");
  book.modified = book.created;
  book.calcProperties.fullCalcOnLoad = true;

  const revenue = book.addWorksheet("Doanh thu");
  title(revenue, input, "DOANH THU THEO NGUỒN GHI NHẬN", 12);
  header(revenue, 3, [
    "Ngày",
    "Nguồn",
    "Tham chiếu",
    "Khách hàng",
    "Dự án",
    "Hợp đồng",
    "Đã xuất hóa đơn",
    "Đã ghi nhận",
    "Đã thu",
    "Trạng thái",
    "Từ ngày",
    "Đến ngày",
  ]);
  for (const item of input.revenue)
    revenue.addRow([
      typedDate(item.date),
      item.sourceType,
      item.reference,
      item.customerName,
      item.projectName ?? null,
      item.contractReference ?? null,
      exactMoney(item.invoicedMinor),
      exactMoney(item.recognizedMinor),
      exactMoney(item.collectedMinor),
      item.state,
      typedDate(input.startsOn),
      typedDate(input.endsOn),
    ]);
  totalRow(revenue, 4, [7, 8, 9]);
  finish(revenue, [14, 22, 24, 32, 28, 22, 18, 18, 18, 16, 14, 14], [1, 11, 12], [7, 8, 9]);

  const receivables = book.addWorksheet("Công nợ");
  title(receivables, input, "CÔNG NỢ PHẢI THU THEO KHÁCH HÀNG VÀ HÓA ĐƠN", 10);
  header(receivables, 3, [
    "Khách hàng",
    "Số hóa đơn",
    "Dự án",
    "Ngày hóa đơn",
    "Hạn thanh toán",
    "Tổng hóa đơn",
    "Đã thu",
    "Còn phải thu",
    "Tuổi nợ",
    "Trạng thái",
  ]);
  for (const item of input.receivables)
    receivables.addRow([
      item.customerName,
      item.documentNumber,
      item.projectName ?? null,
      typedDate(item.documentDate),
      typedDate(item.dueDate),
      exactMoney(item.grossMinor),
      exactMoney(item.collectedMinor),
      exactMoney(item.outstandingMinor),
      item.agingBucket,
      item.state,
    ]);
  totalRow(receivables, 4, [6, 7, 8]);
  finish(receivables, [32, 20, 28, 15, 17, 18, 18, 18, 16, 16], [4, 5], [6, 7, 8]);

  const expenses = book.addWorksheet("Chi phí");
  title(expenses, input, "CHI PHÍ THEO CHỨNG TỪ GỐC", 12);
  header(expenses, 3, [
    "Ngày",
    "Nguồn",
    "Tham chiếu",
    "Nhà cung cấp / Người nhận",
    "Dự án",
    "Hạng mục",
    "Diễn giải",
    "Trước thuế",
    "VAT",
    "Tổng chi phí",
    "Nguồn tiền",
    "Trạng thái",
  ]);
  for (const item of input.expenses)
    expenses.addRow([
      typedDate(item.date),
      item.sourceType,
      item.reference,
      item.supplierOrPayeeName ?? null,
      item.projectName ?? null,
      item.categoryName,
      item.description,
      exactMoney(item.netMinor),
      exactMoney(item.taxMinor),
      exactMoney(item.grossMinor),
      item.fundingSource ?? null,
      item.state,
    ]);
  totalRow(expenses, 4, [8, 9, 10]);
  finish(expenses, [14, 20, 24, 34, 28, 24, 42, 18, 16, 18, 22, 16], [1], [8, 9, 10]);

  const metrics = book.addWorksheet("Chỉ số tháng");
  title(metrics, input, "CHỈ SỐ TÀI CHÍNH THEO THÁNG", 9);
  header(metrics, 3, [
    "Tháng",
    "Doanh thu xuất HĐ",
    "Doanh thu ghi nhận",
    "Tiền đã thu",
    "Chi phí",
    "Lợi nhuận kế toán",
    "Công nợ",
    "VAT đầu ra",
    "VAT đầu vào",
  ]);
  for (const item of input.monthlyMetrics)
    metrics.addRow([
      item.month,
      exactMoney(item.invoicedRevenueMinor),
      exactMoney(item.recognizedRevenueMinor),
      exactMoney(item.collectedRevenueMinor),
      exactMoney(item.expenseMinor),
      exactMoney(item.accountingProfitMinor),
      exactMoney(item.receivableMinor),
      exactMoney(item.outputVatMinor),
      exactMoney(item.inputVatMinor),
    ]);
  totalRow(metrics, 4, [2, 3, 4, 5, 6, 8, 9]);
  finish(metrics, [14, 20, 20, 18, 18, 20, 18, 18, 18], [], [2, 3, 4, 5, 6, 7, 8, 9]);

  const plans = book.addWorksheet("Kế hoạch & mục tiêu");
  title(plans, input, "KẾ HOẠCH, MỤC TIÊU VÀ THỰC TẾ", 9);
  header(plans, 3, [
    "Tháng",
    "Mục tiêu doanh thu",
    "Dự báo doanh thu",
    "Doanh thu thực tế",
    "Dự báo chi phí",
    "Chi phí thực tế",
    "Tiền cuối kỳ dự báo",
    "Tiền cuối kỳ thực tế",
    "Trạng thái",
  ]);
  for (const item of input.plans)
    plans.addRow([
      item.month,
      exactMoney(item.revenueTargetMinor),
      exactMoney(item.forecastRevenueMinor),
      exactMoney(item.actualRevenueMinor),
      exactMoney(item.forecastExpenseMinor),
      exactMoney(item.actualExpenseMinor),
      optionalMoney(item.forecastClosingCashMinor),
      optionalMoney(item.actualClosingCashMinor),
      item.state,
    ]);
  totalRow(plans, 4, [2, 3, 4, 5, 6]);
  finish(plans, [14, 20, 20, 20, 20, 20, 22, 22, 16], [], [2, 3, 4, 5, 6, 7, 8]);

  const categories = book.addWorksheet("Hạng mục chi");
  title(categories, input, "CHI PHÍ THEO HẠNG MỤC VÀ THÁNG", 4);
  header(categories, 3, ["Tháng", "Mã hạng mục", "Hạng mục chi", "Số tiền"]);
  for (const item of input.expenseCategories)
    categories.addRow([
      item.month,
      item.categoryCode,
      item.categoryName,
      exactMoney(item.amountMinor),
    ]);
  totalRow(categories, 4, [4]);
  finish(categories, [14, 20, 34, 20], [], [4]);

  const controls = book.addWorksheet("Controls");
  title(controls, input, "KIỂM SOÁT NGUỒN VÀ PHẠM VI WORKBOOK", 4);
  header(controls, 3, ["Kiểm soát", "Giá trị", "Trạng thái", "Ghi chú"]);
  controls.addRow([
    "Organization ID",
    input.organizationId,
    "pass",
    "Phạm vi tổ chức của toàn bộ dữ liệu xuất",
  ]);
  controls.addRow([
    "Payroll / Bảng lương",
    "Không xuất",
    "unavailable",
    "Chưa có canonical payroll resource; không suy diễn từ expense hoặc workbook cũ",
  ]);
  controls.addRow([
    "Bonus / Tỉ lệ thưởng",
    "Không xuất",
    "unavailable",
    "Chưa có canonical bonus resource; không suy diễn quyết định thưởng từ expense",
  ]);
  for (const item of input.controls ?? [])
    controls.addRow([item.name, item.value, item.status, item.note]);
  finish(controls, [30, 24, 16, 72], [], []);

  return book;
}
