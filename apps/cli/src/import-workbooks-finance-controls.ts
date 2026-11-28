import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { countFormulas, parseMoney, textValue } from "./import-workbooks-cell-values.js";
import { ingestFinanceSalesAndExpenses } from "./import-workbooks-finance-transactions.js";
import type { ReviewRow, WorkbookImportAccumulator } from "./import-workbooks-types.js";

export async function ingestFinanceWorkbook(
  financeWorkbookPath: string,
  state: WorkbookImportAccumulator,
): Promise<void> {
  const bytes = await readFile(financeWorkbookPath);
  const hash = createHash("sha256").update(bytes).digest("hex");
  state.sources.push({
    kind: "finance",
    sha256: hash,
    filename: financeWorkbookPath.split("/").at(-1)!,
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  for (const sheet of workbook.worksheets) {
    const disposition =
      sheet.name === "Doanh thu"
        ? "sales"
        : sheet.name === "Chi phí"
          ? "expenses"
          : ["Tỷ suất lợi nhuận", "Planing & Target", "Hạng mục chi", "Công nợ"].includes(
                sheet.name,
              )
            ? "control"
            : "reference";
    state.inventory.push({
      workbook: "finance",
      sheet: sheet.name,
      rowCount: sheet.rowCount,
      dataRowCount: Math.max(0, sheet.rowCount - 1),
      formulaCellCount: countFormulas(sheet),
      disposition,
    });
  }

  ingestFinanceSalesAndExpenses(workbook, hash, state);

  const profitSheet = workbook.getWorksheet("Tỷ suất lợi nhuận");
  if (profitSheet) {
    let sales = 0n;
    let expense = 0n;
    let profit = 0n;
    for (let rowNumber = 2; rowNumber <= profitSheet.rowCount; rowNumber += 1) {
      sales += parseMoney(profitSheet.getRow(rowNumber).getCell(2).value);
      expense += parseMoney(profitSheet.getRow(rowNumber).getCell(4).value);
      profit += parseMoney(profitSheet.getRow(rowNumber).getCell(7).value);
    }
    state.controls.push({
      workbook: "finance",
      sheet: profitSheet.name,
      year: 2025,
      salesMinor: sales.toString(),
      expenseMinor: expense.toString(),
      profitMinor: profit.toString(),
    });
  }

  const stageControlSheet = (
    sheetName: string,
    kind: ReviewRow["kind"],
    proposedResourceType: ReviewRow["proposedResourceType"],
  ) => {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) return;
    const headers = sheet.getRow(1).values as ExcelJS.CellValue[];
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const rawData: Record<string, unknown> = {};
      for (let column = 1; column <= sheet.columnCount; column += 1) {
        const header = textValue(headers[column] ?? `column_${column}`) || `column_${column}`;
        if (
          kind === "payroll_master" &&
          !["Lương NET", "Status", "Name", "Department", "Thâm niên", "Type", "Hire date"].includes(
            header,
          )
        )
          continue;
        rawData[header] = textValue(row.getCell(column).value);
      }
      if (!Object.values(rawData).some((value) => textValue(value as ExcelJS.CellValue))) continue;
      state.reviewSources.push({
        workbook: "finance",
        sheet: sheetName,
        row: rowNumber,
        hash,
        kind,
        rawData,
      });
    }
    state.controlResourceTypes.set(kind, proposedResourceType);
  };

  stageControlSheet("Công nợ", "debt_control", "ar_control");
  stageControlSheet("Tỷ suất lợi nhuận", "profitability_control", "profitability_control");
  stageControlSheet("Planing & Target", "planning_control", "planning_control");
  stageControlSheet("Tỉ lệ thưởng", "bonus_control", "bonus_control");
  stageControlSheet("Bảng lương", "payroll_master", "payroll_control_pending");
  stageControlSheet("Hạng mục chi", "expense_category_control", "expense_category_control");
}
