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
  /** Output VAT from the canonical sales document; zero for non-invoice sources. */
  taxMinor?: string;
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
  dashboard?: Readonly<{
    asOf: string;
    financials: Readonly<{
      revenueMinor: string;
      expenseMinor: string;
      netProfitMinor: string;
      cashAndBankMinor: string;
      bankAvailableMinor?: string;
      cashOnHandMinor?: string;
      ownerPayableMinor: string;
      ownerHoldsCompanyFundsMinor?: string;
      netCompanyFundsMinor: string;
      taxableProfitMinor: string;
      corporateIncomeTaxMinor: string | null;
      corporateIncomeTaxRateBps?: number | null;
      monthly: readonly Readonly<{
        period: string;
        revenueMinor: string;
        expenseMinor: string;
        netProfitMinor: string;
      }>[];
    }>;
    collections: Readonly<{ receivablesMinor: string }>;
  }>;
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
  title(revenue, input, "DOANH THU THEO NGUỒN GHI NHẬN", 13);
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
    "VAT đầu ra",
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
      exactMoney(item.taxMinor ?? "0"),
    ]);
  totalRow(revenue, 4, [7, 8, 9]);
  finish(revenue, [14, 22, 24, 32, 28, 22, 18, 18, 18, 16, 14, 14, 16], [1, 11, 12], [7, 8, 9, 13]);

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

  // These sheets intentionally retain the backend value and add an independent
  // Excel calculation over the typed source rows. This makes the workbook useful
  // for accountant reconciliation without turning Excel into the system of record.
  const monthStartFormula = (cell: string) =>
    `DATE(VALUE(LEFT(${cell},4)),VALUE(RIGHT(${cell},2)),1)`;
  const monthEndFormula = (cell: string) => `EDATE(${monthStartFormula(cell)},1)`;
  const addCheckSheet = (
    name: string,
    label: string,
    backend: readonly string[],
    formula: (row: number) => string,
  ) => {
    const sheet = book.addWorksheet(name);
    title(sheet, input, `${label.toUpperCase()} — ĐỐI SOÁT CÔNG THỨC EXCEL`, 5);
    header(sheet, 3, ["Tháng", "Giá trị backend", "Công thức Excel", "Chênh lệch", "Trạng thái"]);
    backend.forEach((value, index) => {
      const row = index + 4;
      sheet.addRow([
        input.monthlyMetrics[index]?.month ?? "",
        exactMoney(value),
        { formula: formula(row), result: 0 },
        { formula: `=C${row}-B${row}`, result: 0 },
        { formula: `=IF(ABS(D${row})<0.5,"PASS","CHECK")`, result: "PASS" },
      ]);
    });
    totalRow(sheet, 4, [2, 3, 4]);
    finish(sheet, [14, 20, 56, 20, 16], [], [2, 3, 4]);
    return sheet;
  };
  const metricMonths = input.monthlyMetrics.map((row) => row.month);
  const revenueEnd = Math.max(4, 3 + input.revenue.length);
  const expenseEnd = Math.max(4, 3 + input.expenses.length);
  const receivableEnd = Math.max(4, 3 + input.receivables.length);
  const revenueMonth = (row: number) => monthStartFormula(`$A${row}`);
  const revenueCriteria = (row: number) =>
    `'Doanh thu'!$A$4:$A$${revenueEnd},">="&${revenueMonth(row)},'Doanh thu'!$A$4:$A$${revenueEnd},"<"&${monthEndFormula(`$A${row}`)}`;
  const expenseCriteria = (row: number) =>
    `'Chi phí'!$A$4:$A$${expenseEnd},">="&${revenueMonth(row)},'Chi phí'!$A$4:$A$${expenseEnd},"<"&${monthEndFormula(`$A${row}`)}`;
  const dashboardMetricFormula = (column: string, row: number) =>
    input.dashboard
      ? `SUMIFS('Dashboard tháng'!$${column}$4:$${column}$${Math.max(4, 3 + input.dashboard.financials.monthly.length)},'Dashboard tháng'!$A$4:$A$${Math.max(4, 3 + input.dashboard.financials.monthly.length)},$A${row})`
      : undefined;
  addCheckSheet(
    "Đối soát doanh thu",
    "Doanh thu ghi nhận",
    input.dashboard
      ? input.dashboard.financials.monthly.map((row) => row.revenueMinor)
      : input.monthlyMetrics.map((row) => row.recognizedRevenueMinor),
    (row) =>
      dashboardMetricFormula("B", row) ??
      `SUMIFS('Doanh thu'!$H$4:$H$${revenueEnd},${revenueCriteria(row)})`,
  );
  addCheckSheet(
    "Đối soát chi phí",
    "Tổng chi phí",
    input.dashboard
      ? input.dashboard.financials.monthly.map((row) => row.expenseMinor)
      : input.monthlyMetrics.map((row) => row.expenseMinor),
    (row) =>
      dashboardMetricFormula("C", row) ??
      `SUMIFS('Chi phí'!$H$4:$H$${expenseEnd},${expenseCriteria(row)})`,
  );
  addCheckSheet(
    "Đối soát xuất HĐ",
    "Doanh thu xuất hóa đơn",
    input.monthlyMetrics.map((row) => row.invoicedRevenueMinor),
    (row) => `SUMIFS('Doanh thu'!$G$4:$G$${revenueEnd},${revenueCriteria(row)})`,
  );
  addCheckSheet(
    "Đối soát tiền thu",
    "Tiền đã thu",
    input.monthlyMetrics.map((row) => row.collectedRevenueMinor),
    (row) => `SUMIFS('Doanh thu'!$I$4:$I$${revenueEnd},${revenueCriteria(row)})`,
  );
  addCheckSheet(
    "Đối soát lợi nhuận",
    "Lợi nhuận kế toán",
    input.dashboard
      ? input.dashboard.financials.monthly.map((row) => row.netProfitMinor)
      : input.monthlyMetrics.map((row) => row.accountingProfitMinor),
    (row) =>
      dashboardMetricFormula("D", row) ??
      `SUMIFS('Doanh thu'!$H$4:$H$${revenueEnd},${revenueCriteria(row)})-SUMIFS('Chi phí'!$H$4:$H$${expenseEnd},${expenseCriteria(row)})`,
  );
  const vatSheet = book.addWorksheet("Đối soát VAT");
  title(vatSheet, input, "VAT — ĐỐI SOÁT CÔNG THỨC EXCEL", 9);
  header(vatSheet, 3, [
    "Tháng",
    "VAT đầu ra backend",
    "VAT đầu ra Excel",
    "Chênh lệch đầu ra",
    "VAT đầu vào backend",
    "VAT đầu vào Excel",
    "Chênh lệch đầu vào",
    "Chênh lệch ròng",
    "Trạng thái",
  ]);
  metricMonths.forEach((month, index) => {
    const row = index + 4;
    const output = `SUMIFS('Doanh thu'!$M$4:$M$${revenueEnd},${revenueCriteria(row)})`;
    const inputVat = `SUMIFS('Chi phí'!$I$4:$I$${expenseEnd},${expenseCriteria(row)})`;
    vatSheet.addRow([
      month,
      exactMoney(input.monthlyMetrics[index]!.outputVatMinor),
      { formula: output, result: 0 },
      { formula: `=C${row}-B${row}`, result: 0 },
      exactMoney(input.monthlyMetrics[index]!.inputVatMinor),
      { formula: inputVat, result: 0 },
      { formula: `=F${row}-E${row}`, result: 0 },
      { formula: `=D${row}-G${row}`, result: 0 },
      { formula: `=IF(ABS(H${row})<0.5,"PASS","CHECK")`, result: "PASS" },
    ]);
  });
  totalRow(vatSheet, 4, [2, 3, 4, 5, 6, 7, 8]);
  finish(vatSheet, [14, 20, 20, 18, 20, 20, 18, 18, 16], [], [2, 3, 4, 5, 6, 7, 8]);
  addCheckSheet(
    "Đối soát công nợ",
    "Công nợ phải thu",
    input.monthlyMetrics.map((row) => row.receivableMinor),
    (row) =>
      `SUMIFS('Công nợ'!$H$4:$H$${receivableEnd},'Công nợ'!$D$4:$D$${receivableEnd},">="&${revenueMonth(row)},'Công nợ'!$D$4:$D$${receivableEnd},"<"&${monthEndFormula(`$A${row}`)})`,
  );

  if (input.dashboard) {
    const source = book.addWorksheet("Dashboard nguồn");
    title(source, input, "DASHBOARD — NGUỒN CANONICAL API", 3);
    header(source, 3, ["Tham số", "Giá trị API", "Ghi chú"]);
    const sourceRows = [
      [
        "bankAvailableMinor",
        input.dashboard.financials.bankAvailableMinor ?? "0",
        "Tiền ngân hàng",
      ],
      ["cashOnHandMinor", input.dashboard.financials.cashOnHandMinor ?? "0", "Tiền mặt công ty"],
      ["cashAndBankMinor", input.dashboard.financials.cashAndBankMinor, "Tổng bank + cash"],
      ["ownerPayableMinor", input.dashboard.financials.ownerPayableMinor, "Công ty nợ chủ"],
      [
        "ownerHoldsCompanyFundsMinor",
        input.dashboard.financials.ownerHoldsCompanyFundsMinor ?? "0",
        "Tiền công ty chủ đang giữ",
      ],
      [
        "netCompanyFundsMinor",
        input.dashboard.financials.netCompanyFundsMinor,
        "Tiền công ty ròng",
      ],
      ["taxableProfitMinor", input.dashboard.financials.taxableProfitMinor, "Lợi nhuận tính thuế"],
      [
        "corporateIncomeTaxMinor",
        input.dashboard.financials.corporateIncomeTaxMinor ?? "0",
        "Thuế TNDN",
      ],
      [
        "corporateIncomeTaxRateBps",
        String(input.dashboard.financials.corporateIncomeTaxRateBps ?? 0),
        "Thuế suất (bps)",
      ],
      ["receivablesMinor", input.dashboard.collections.receivablesMinor, "Công nợ phải thu"],
    ] as const;
    const sourceRow = new Map<string, number>();
    sourceRows.forEach(([key, value, note]) => {
      const row = source.rowCount + 1;
      sourceRow.set(key, row);
      source.addRow([key, /^-?\d+$/.test(value) ? exactMoney(value) : value, note]);
    });
    finish(source, [34, 28, 48], [], [2]);
    const dashboard = book.addWorksheet("Dashboard metrics");
    title(dashboard, input, "DASHBOARD — GIÁ TRỊ CANONICAL VÀ ĐỐI SOÁT", 5);
    header(dashboard, 3, [
      "Metric",
      "Giá trị dashboard API",
      "Công thức Excel",
      "Chênh lệch",
      "Trạng thái",
    ]);
    const rows: readonly Readonly<{ key: string; value: string; formula: string }>[] = [
      // Use the dashboard's own monthly projection as the formula source. The
      // management `Chỉ số tháng` sheet intentionally mixes document and ledger
      // controls and is therefore not a safe source for dashboard parity.
      {
        key: "Doanh thu",
        value: input.dashboard.financials.revenueMinor,
        formula: "=SUM('Dashboard tháng'!B4:B200)",
      },
      {
        key: "Chi phí",
        value: input.dashboard.financials.expenseMinor,
        formula: "=SUM('Dashboard tháng'!C4:C200)",
      },
      {
        key: "Lợi nhuận ròng",
        value: input.dashboard.financials.netProfitMinor,
        formula: "=SUM('Dashboard tháng'!D4:D200)",
      },
      {
        key: "Công nợ phải thu",
        value: input.dashboard.collections.receivablesMinor,
        formula: "=SUM('Công nợ'!H4:H200)",
      },
      {
        key: "Tiền công ty (bank + cash)",
        value: input.dashboard.financials.cashAndBankMinor,
        formula: `='Dashboard nguồn'!B${sourceRow.get("bankAvailableMinor")}+'Dashboard nguồn'!B${sourceRow.get("cashOnHandMinor")}`,
      },
      {
        key: "Công ty nợ chủ",
        value: input.dashboard.financials.ownerPayableMinor,
        formula: `='Dashboard nguồn'!B${sourceRow.get("ownerPayableMinor")}`,
      },
      {
        key: "Tiền công ty ròng",
        value: input.dashboard.financials.netCompanyFundsMinor,
        formula: "=C8-C9",
      },
      {
        key: "Lợi nhuận tính thuế",
        value: input.dashboard.financials.taxableProfitMinor,
        formula: `='Dashboard nguồn'!B${sourceRow.get("taxableProfitMinor")}`,
      },
      {
        key: "Thuế TNDN",
        value: input.dashboard.financials.corporateIncomeTaxMinor ?? "0",
        formula: `=MAX(0,C11)*'Dashboard nguồn'!B${sourceRow.get("corporateIncomeTaxRateBps")}/10000`,
      },
    ];
    rows.forEach((item, index) => {
      const row = index + 4;
      dashboard.addRow([
        item.key,
        exactMoney(item.value),
        { formula: item.formula, result: 0 },
        { formula: `=C${row}-B${row}`, result: 0 },
        { formula: `=IF(ABS(D${row})<0.5,"PASS","CHECK")`, result: "PASS" },
      ]);
    });
    finish(dashboard, [32, 24, 50, 20, 16], [], [2, 3, 4]);
    const monthly = book.addWorksheet("Dashboard tháng");
    title(monthly, input, "DASHBOARD — P&L THEO THÁNG", 5);
    header(monthly, 3, [
      "Tháng",
      "Doanh thu API",
      "Chi phí API",
      "Lợi nhuận API",
      "Công thức lợi nhuận",
    ]);
    input.dashboard.financials.monthly.forEach((item) => {
      const row = monthly.rowCount + 1;
      monthly.addRow([
        item.period,
        exactMoney(item.revenueMinor),
        exactMoney(item.expenseMinor),
        exactMoney(item.netProfitMinor),
        { formula: `=B${row}-C${row}`, result: 0 },
      ]);
    });
    finish(monthly, [14, 22, 22, 22, 28], [], [2, 3, 4, 5]);
  }

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
