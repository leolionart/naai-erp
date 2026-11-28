import type ExcelJS from "exceljs";
import { parseDate, parseMoney, stableId, textValue } from "./import-workbooks-cell-values.js";
import {
  declaredExpenseCategory,
  inferExpenseCategory,
  inferSupplier,
  REVIEWED_SALES_PROJECT_ROWS,
} from "./import-workbooks-classifications.js";
import type { WorkbookImportAccumulator } from "./import-workbooks-types.js";

function parseFinanceSheetRows(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  state: WorkbookImportAccumulator,
  callback: (row: ExcelJS.Row, rowNumber: number) => void,
) {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) {
    state.issues.push({
      severity: "error",
      workbook: "finance",
      sheet: sheetName,
      message: "required sheet is missing",
    });
    return;
  }
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    try {
      callback(sheet.getRow(rowNumber), rowNumber);
    } catch (error) {
      state.issues.push({
        severity: "error",
        workbook: "finance",
        sheet: sheetName,
        row: rowNumber,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export function ingestFinanceSalesAndExpenses(
  workbook: ExcelJS.Workbook,
  hash: string,
  state: WorkbookImportAccumulator,
): void {
  parseFinanceSheetRows(workbook, "Doanh thu", state, (row, rowNumber) => {
    const date = parseDate(row.getCell(1).value);
    const salesRawData = {
      transactionDate: textValue(row.getCell(1).value),
      projectRevenue: textValue(row.getCell(2).value),
      contractValue: textValue(row.getCell(3).value),
      vat: textValue(row.getCell(4).value),
      cash: textValue(row.getCell(5).value),
      received: textValue(row.getCell(6).value),
      actualReceived: textValue(row.getCell(6).value),
      revenueType: textValue(row.getCell(7).value),
      sourceMonth: textValue(row.getCell(8).value),
      companyOrClient: textValue(row.getCell(9).value),
      notes: textValue(row.getCell(10).value),
      invoiceMode: textValue(row.getCell(11).value),
      refCtv: textValue(row.getCell(12).value),
      monthLabel: textValue(row.getCell(13).value),
      status: textValue(row.getCell(14).value),
      invoiceIssued: textValue(row.getCell(15).value),
      ctvPay: textValue(row.getCell(16).value),
      action: textValue(row.getCell(17).value),
    };
    if (
      !textValue(row.getCell(2).value) &&
      textValue(row.getCell(7).value).toLocaleLowerCase("vi").includes("cá nhân")
    ) {
      state.reviewSources.push({
        workbook: "finance",
        sheet: "Doanh thu",
        row: rowNumber,
        hash,
        kind: "owner_movement",
        rawData: salesRawData,
      });
      state.issues.push({
        severity: "warning",
        workbook: "finance",
        sheet: "Doanh thu",
        row: rowNumber,
        message: "owner/personal cash movement excluded from sales invoices",
      });
      return;
    }
    const net = parseMoney(row.getCell(2).value);
    const tax = parseMoney(row.getCell(4).value);
    const gross = net + tax;
    const id = stableId("sales", hash, "Doanh thu", rowNumber);
    const clientPartyId = state.party(textValue(row.getCell(9).value), "client");
    const mappedProjectSourceRow = REVIEWED_SALES_PROJECT_ROWS.get(rowNumber);
    const mappedProject = mappedProjectSourceRow
      ? state.projectsBySourceRow.get(mappedProjectSourceRow)
      : undefined;
    if (mappedProject && mappedProjectSourceRow) {
      mappedProject.clientPartyId = clientPartyId;
      state.issues.push({
        severity: "warning",
        workbook: "finance",
        sheet: "Doanh thu",
        row: rowNumber,
        field: "Project mapping",
        message: `linked to Projects row ${mappedProjectSourceRow} by reviewed workbook mapping v2`,
      });
    }
    const sourceMonthRaw = textValue(row.getCell(8).value);
    const sourceMonth = /^\d{1,2}$/.test(sourceMonthRaw) ? Number(sourceMonthRaw) : null;
    if (sourceMonth === null) {
      state.issues.push({
        severity: "warning",
        workbook: "finance",
        sheet: "Doanh thu",
        row: rowNumber,
        field: "Tháng",
        message: "legacy profitability control excludes this row because source month is blank",
      });
    } else if (!date.startsWith("2025")) {
      state.issues.push({
        severity: "warning",
        workbook: "finance",
        sheet: "Doanh thu",
        row: rowNumber,
        field: "Tháng",
        message: `legacy profitability control assigns ${date} transaction to month ${sourceMonth} of its 2025 rollup`,
      });
    }
    state.salesInvoices.push({
      id,
      documentNumber: `WB-${id.slice(-16).toUpperCase()}`,
      partyId: clientPartyId,
      ...(mappedProject ? { projectId: String(mappedProject.id) } : {}),
      documentDate: date,
      dueDate: date,
      currency: "VND",
      netMinor: net.toString(),
      taxMinor: tax.toString(),
      grossMinor: gross.toString(),
      controlAccountCode: "131",
      sourceRowIndex: rowNumber,
      sourceIdentity: `${hash}:Doanh thu:${rowNumber}`,
      sourceMetadata: {
        contractValueMinor: textValue(row.getCell(3).value)
          ? parseMoney(row.getCell(3).value).toString()
          : null,
        cashMinor: textValue(row.getCell(5).value)
          ? parseMoney(row.getCell(5).value).toString()
          : null,
        actualReceivedMinor: textValue(row.getCell(6).value)
          ? parseMoney(row.getCell(6).value).toString()
          : null,
        revenueType: textValue(row.getCell(7).value),
        notes: textValue(row.getCell(10).value),
        invoiceMode: textValue(row.getCell(11).value),
        refCtvMinor: textValue(row.getCell(12).value)
          ? parseMoney(row.getCell(12).value).toString()
          : null,
        monthLabel: textValue(row.getCell(13).value),
        status: textValue(row.getCell(14).value),
        invoiceIssued: textValue(row.getCell(15).value),
        ctvPay: textValue(row.getCell(16).value),
        action: textValue(row.getCell(17).value),
      },
      legacyControlTreatment: {
        sourceSheet: "Doanh thu",
        sourceRow: rowNumber,
        controlYear: 2025,
        controlMonth: sourceMonth,
        included: sourceMonth !== null,
        classification:
          sourceMonth === null
            ? "unassigned_source_month"
            : date.startsWith("2025")
              ? "legacy_explicit_month"
              : "legacy_month_crosses_calendar_year",
        evidence: JSON.stringify({
          periodField: "Tháng",
          periodValue: sourceMonthRaw || null,
          transactionDate: date,
        }),
      },
    });
    state.reviewSources.push({
      workbook: "finance",
      sheet: "Doanh thu",
      row: rowNumber,
      hash,
      kind: "sales",
      rawData: salesRawData,
    });
  });

  parseFinanceSheetRows(workbook, "Chi phí", state, (row, rowNumber) => {
    const date = parseDate(row.getCell(1).value);
    const gross = parseMoney(row.getCell(2).value);
    const tax = parseMoney(row.getCell(7).value);
    const sourceExpenseType = textValue(row.getCell(9).value);
    const note = textValue(row.getCell(14).value);
    const inferredCategory = inferExpenseCategory(sourceExpenseType, note);
    const category = declaredExpenseCategory(inferredCategory);
    const supplier = inferSupplier(textValue(row.getCell(10).value), note, inferredCategory.code);
    const type = sourceExpenseType || category.label;
    state.reviewSources.push({
      workbook: "finance",
      sheet: "Chi phí",
      row: rowNumber,
      hash,
      kind: "expense",
      rawData: {
        transactionDate: textValue(row.getCell(1).value),
        gross: textValue(row.getCell(2).value),
        sourceMonth: textValue(row.getCell(3).value),
        manualCost: textValue(row.getCell(4).value),
        cash: textValue(row.getCell(5).value),
        vatRate: textValue(row.getCell(6).value),
        vat: textValue(row.getCell(7).value),
        invoiceDate: textValue(row.getCell(8).value),
        expenseType: textValue(row.getCell(9).value),
        personnel: textValue(row.getCell(10).value),
        department: textValue(row.getCell(11).value),
        fundingSource: textValue(row.getCell(12).value),
        monthLabel: textValue(row.getCell(13).value),
        notes: note,
        invoiceFile: textValue(row.getCell(15).value),
      },
    });
    const id = stableId("expense", hash, "Chi phí", rowNumber);
    // Preserve the source workbook's explicit profitability treatment. Inferred categories
    // improve purchase-invoice classification but must not silently rewrite legacy controls.
    const lower = sourceExpenseType.toLocaleLowerCase("vi");
    const noteLower = note.toLocaleLowerCase("vi");
    const recurringPersonnel =
      (lower.includes("lương") || lower.includes("thưởng")) &&
      !noteLower.includes("freelance dự án") &&
      !noteLower.includes("thưởng dự án");
    const sourceMonthRaw = textValue(row.getCell(3).value);
    const sourceMonth = /^\d{1,2}$/.test(sourceMonthRaw) ? Number(sourceMonthRaw) : null;
    if (sourceMonth !== null && !date.startsWith("2025")) {
      state.issues.push({
        severity: "warning",
        workbook: "finance",
        sheet: "Chi phí",
        row: rowNumber,
        field: "Tháng",
        message: `legacy profitability control assigns ${date} transaction to month ${sourceMonth} of its 2025 rollup`,
      });
    }
    state.expenses.push({
      id,
      amountMinor: gross.toString(),
      taxMinor: tax.toString(),
      date,
      class: category.code,
      categoryCode: category.code,
      categoryLabel: category.label,
      supplierDisplayName: supplier.name,
      payeePartyId: supplier.name
        ? state.party(supplier.name, "supplier")
        : state.party("Generic Supplier", "supplier"),
      businessPurpose: note || type,
      currency: "VND",
      sourceRowIndex: rowNumber,
      sourceIdentity: `${hash}:Chi phí:${rowNumber}`,
      sourceMetadata: {
        manualCost: textValue(row.getCell(4).value),
        cashMinor: textValue(row.getCell(5).value)
          ? parseMoney(row.getCell(5).value).toString()
          : null,
        vatRate: textValue(row.getCell(6).value),
        invoiceDate: textValue(row.getCell(8).value),
        department: textValue(row.getCell(11).value),
        fundingSource: textValue(row.getCell(12).value),
        monthLabel: textValue(row.getCell(13).value),
        invoiceFile: textValue(row.getCell(15).value),
        sourceExpenseType,
        supplierDisplayName: supplier.name,
        supplierInferenceSource: supplier.source,
        categoryCode: inferredCategory.code,
        categoryLabel: inferredCategory.label,
        categoryInferenceSource: inferredCategory.source,
      },
      legacyControlTreatment: {
        sourceSheet: "Chi phí",
        sourceRow: rowNumber,
        controlYear: 2025,
        controlMonth: sourceMonth,
        included: sourceMonth !== null && !recurringPersonnel,
        classification:
          sourceMonth === null
            ? "unassigned_source_month"
            : recurringPersonnel
              ? "recurring_personnel_excluded_from_operating_expense_control"
              : !date.startsWith("2025")
                ? "legacy_month_crosses_calendar_year"
                : lower.includes("lương") || lower.includes("thưởng")
                  ? "direct_project_personnel_included"
                  : "legacy_explicit_month",
        evidence: JSON.stringify({
          periodField: "Tháng",
          periodValue: sourceMonthRaw || null,
          scopeField: "Loại chi phí",
          scopeValue: type,
          transactionDate: date,
          note: note || null,
        }),
      },
    });
  });
}
