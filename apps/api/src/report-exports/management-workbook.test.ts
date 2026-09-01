import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { createManagementWorkbook, type ManagementWorkbookInput } from "./management-workbook.js";

const input = (): ManagementWorkbookInput => ({
  organizationId: "naai",
  organizationName: "CÔNG TY TNHH NAAI STUDIO",
  startsOn: "2026-01-01",
  endsOn: "2026-12-31",
  asOfDate: "2026-08-09",
  revenue: [
    {
      date: "2026-05-05",
      sourceType: "sales_invoice",
      reference: "C26TNT-8",
      customerName: "BM WINDOWS",
      projectName: "Ceramic Coaster",
      contractReference: "HD-CC-2026",
      invoicedMinor: "5687500",
      recognizedMinor: "0",
      collectedMinor: "4042500",
      state: "issued",
    },
  ],
  receivables: [
    {
      customerName: "BM WINDOWS",
      documentNumber: "8",
      projectName: "Ceramic Coaster",
      documentDate: "2026-05-05",
      dueDate: "2026-06-05",
      grossMinor: "6142500",
      collectedMinor: "4042500",
      outstandingMinor: "2100000",
      agingBucket: "31-60",
      state: "partial",
    },
  ],
  expenses: [
    {
      date: "2026-01-02",
      sourceType: "purchase_invoice",
      reference: "1K26TPH-93313",
      supplierOrPayeeName: "EVN",
      categoryName: "Tiền điện",
      description: "Điện tiêu thụ",
      netMinor: "1796640",
      taxMinor: "143731",
      grossMinor: "1940371",
      fundingSource: "331-AP",
      state: "posted",
    },
  ],
  monthlyMetrics: [
    {
      month: "2026-05",
      invoicedRevenueMinor: "5687500",
      recognizedRevenueMinor: "4000000",
      collectedRevenueMinor: "4042500",
      expenseMinor: "1940371",
      accountingProfitMinor: "2059629",
      receivableMinor: "2100000",
      outputVatMinor: "455000",
      inputVatMinor: "143731",
    },
  ],
  plans: [
    {
      month: "2026-05",
      revenueTargetMinor: "10000000",
      forecastRevenueMinor: "8000000",
      actualRevenueMinor: "4000000",
      forecastExpenseMinor: "3000000",
      actualExpenseMinor: "1940371",
      forecastClosingCashMinor: "5000000",
      actualClosingCashMinor: "3000000",
      state: "published",
    },
  ],
  expenseCategories: [
    {
      month: "2026-01",
      categoryCode: "UTILITIES",
      categoryName: "Tiền điện",
      amountMinor: "1940371",
    },
  ],
  controls: [{ name: "Ledger tie-out", value: "0", status: "pass", note: "Không có chênh lệch" }],
});

describe("ERP-857 management workbook", () => {
  it("exports only supported canonical management sheets with typed values and totals", async () => {
    const created = createManagementWorkbook(input());
    const bytes = await created.xlsx.writeBuffer();
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes as never);

    expect(book.worksheets.map((sheet) => sheet.name)).toEqual([
      "Doanh thu",
      "Công nợ",
      "Chi phí",
      "Chỉ số tháng",
      "Kế hoạch & mục tiêu",
      "Hạng mục chi",
      "Đối soát doanh thu",
      "Đối soát chi phí",
      "Đối soát xuất HĐ",
      "Đối soát tiền thu",
      "Đối soát lợi nhuận",
      "Đối soát VAT",
      "Đối soát công nợ",
      "Controls",
    ]);
    expect(book.getWorksheet("Bảng lương")).toBeUndefined();
    expect(book.getWorksheet("Tỉ lệ thưởng")).toBeUndefined();

    const revenue = book.getWorksheet("Doanh thu")!;
    expect(revenue.getCell("A4").value).toBeInstanceOf(Date);
    expect(revenue.getCell("G4").value).toBe(5_687_500);
    expect(revenue.getCell("G5").value).toMatchObject({ formula: "SUM(G4:G4)" });
    expect(revenue.autoFilter).toBeTruthy();

    const receivables = book.getWorksheet("Công nợ")!;
    expect(receivables.getCell("D4").value).toBeInstanceOf(Date);
    expect(receivables.getCell("E4").value).toBeInstanceOf(Date);
    expect(receivables.getCell("F4").value).toBe(6_142_500);
    expect(receivables.getCell("H4").value).toBe(2_100_000);
    expect(receivables.getCell("J4").value).toBe("partial");
    expect(receivables.getCell("H5").value).toMatchObject({ formula: "SUM(H4:H4)" });

    const expenses = book.getWorksheet("Chi phí")!;
    expect(expenses.getCell("D4").value).toBe("EVN");
    expect(expenses.getCell("J5").value).toMatchObject({ formula: "SUM(J4:J4)" });

    const profitCheck = book.getWorksheet("Đối soát lợi nhuận")!;
    expect(profitCheck.getCell("C4").value).toMatchObject({
      formula: expect.stringContaining("SUMIFS('Doanh thu'!$H$4:$H$4"),
    });
    expect(profitCheck.getCell("D4").value).toMatchObject({ formula: "=C4-B4" });
    const vatCheck = book.getWorksheet("Đối soát VAT")!;
    expect(vatCheck.getCell("I4").value).toMatchObject({
      formula: '=IF(ABS(H4)<0.5,"PASS","CHECK")',
    });

    const controls = book.getWorksheet("Controls")!;
    expect(controls.getColumn(1).values).toContain("Payroll / Bảng lương");
    expect(controls.getColumn(1).values).toContain("Bonus / Tỉ lệ thưởng");
    expect(controls.getColumn(3).values).toContain("unavailable");
  });

  it("rejects amounts that Excel cannot represent exactly", () => {
    const unsafe = input();
    expect(() =>
      createManagementWorkbook({
        ...unsafe,
        revenue: [{ ...unsafe.revenue[0]!, invoicedMinor: "9007199254740992" }],
      }),
    ).toThrow("UNSAFE_EXCEL_AMOUNT");
  });

  it("uses the dashboard monthly projection for parity checks", async () => {
    const created = createManagementWorkbook({
      ...input(),
      dashboard: {
        asOf: "2026-08-09",
        financials: {
          revenueMinor: "4000000",
          expenseMinor: "1940371",
          netProfitMinor: "2059629",
          cashAndBankMinor: "1000000",
          bankAvailableMinor: "0",
          cashOnHandMinor: "1000000",
          ownerPayableMinor: "500000",
          ownerHoldsCompanyFundsMinor: "750000",
          netCompanyFundsMinor: "1500000",
          taxableProfitMinor: "2059629",
          corporateIncomeTaxMinor: "411926",
          monthly: [
            {
              period: "2026-05",
              revenueMinor: "4000000",
              expenseMinor: "1940371",
              netProfitMinor: "2059629",
            },
          ],
        },
        collections: { receivablesMinor: "2100000" },
      },
    });
    const book = new ExcelJS.Workbook();
    await book.xlsx.load((await created.xlsx.writeBuffer()) as never);
    expect(book.getWorksheet("Dashboard metrics")?.getCell("C4").value).toMatchObject({
      formula: "=SUM('Dashboard tháng'!B4:B200)",
    });
    expect(book.getWorksheet("Dashboard metrics")?.getCell("C6").value).toMatchObject({
      formula: "=SUM('Dashboard tháng'!D4:D200)",
    });
    expect(book.getWorksheet("Dashboard metrics")?.getCell("C8").value).toMatchObject({
      // Source rows are bank (4), cash (5), residual company cash (6), then
      // canonical shared cash+bank (7). Custody is deliberately not added.
      formula: "='Dashboard nguồn'!B7",
    });
    expect(book.getWorksheet("Dashboard metrics")?.getCell("E8").value).toMatchObject({
      formula: '=IF(ABS(D8)<0.5,"PASS","CHECK")',
    });
  });
});
