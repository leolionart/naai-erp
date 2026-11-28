import type ExcelJS from "exceljs";
import {
  controlPeriod,
  optionalMoney,
  parseDate,
  stableId,
  targetAttainmentBps,
  textValue,
} from "./import-workbooks-cell-values.js";
import { inferReviewedProjectServiceLine } from "./import-workbooks-classifications.js";
import type {
  ReviewRow,
  ReviewSourceEntry,
  WorkbookControlMappedData,
  WorkbookImportAccumulator,
} from "./import-workbooks-types.js";

export const mapWorkbookControl = (
  source: Pick<ReviewSourceEntry, "workbook" | "sheet" | "row" | "kind" | "rawData">,
): WorkbookControlMappedData => {
  const raw = source.rawData;
  const sourceControl = { workbook: "finance" as const, sheet: source.sheet, row: source.row };
  if (source.kind === "debt_control")
    return {
      sourceControl,
      ...(controlPeriod(raw["Tháng"]) ? { period: controlPeriod(raw["Tháng"]) } : {}),
      projectLabel: textValue(raw["Project Name"] as ExcelJS.CellValue),
      debtMinor: optionalMoney(raw["Công nợ"]) ?? "0",
      projectCostMinor: optionalMoney(raw["Project Cost"]) ?? "0",
      collectedMinor: optionalMoney(raw["Các khoản đã thu"]),
    };
  if (source.kind === "profitability_control")
    return {
      sourceControl,
      ...(controlPeriod(raw["Tháng"]) ? { period: controlPeriod(raw["Tháng"]) } : {}),
      revenueMinor: optionalMoney(raw["Tổng doanh thu"]) ?? "0",
      receivedMinor: optionalMoney(raw["Thực nhận"]) ?? "0",
      expenseMinor: optionalMoney(raw["Chi phí"]) ?? "0",
      profitMinor: optionalMoney(raw["Lợi nhuận (chưa công nợ)"]) ?? "0",
    };
  if (source.kind === "planning_control")
    return {
      sourceControl,
      ...(controlPeriod(raw["Tháng"]) ? { period: controlPeriod(raw["Tháng"]) } : {}),
      revenueMinor: optionalMoney(raw.Revenue) ?? "0",
      receivedMinor: optionalMoney(raw["Real Income"]) ?? "0",
      expenseMinor: optionalMoney(raw["Real Cost"]) ?? "0",
      profitMinor: optionalMoney(raw.Profit) ?? "0",
      targetAttainmentBps: targetAttainmentBps(raw.Target),
      forecastExpenseMinor: optionalMoney(raw["Forcast Cost"]),
      forecastCashMinor: optionalMoney(raw["Forcast Cash"]),
    };
  if (source.kind === "bonus_control")
    return {
      sourceControl,
      ...(controlPeriod(raw.Tháng ?? raw.Month ?? raw.Date)
        ? { period: controlPeriod(raw.Tháng ?? raw.Month ?? raw.Date) }
        : {}),
      personName: textValue(raw.Person as ExcelJS.CellValue),
      bonusMinor: optionalMoney(raw["Tổng thường"]) ?? "0",
      revenueMinor: optionalMoney(raw.Revenue) ?? "0",
    };
  if (source.kind === "payroll_master") {
    const hireDate = textValue(raw["Hire date"] as ExcelJS.CellValue);
    return {
      sourceControl,
      personName: textValue(raw.Name as ExcelJS.CellValue),
      payrollNetMinor: optionalMoney(raw["Lương NET"]) ?? "0",
      employmentStatus: textValue(raw.Status as ExcelJS.CellValue),
      department: textValue(raw.Department as ExcelJS.CellValue),
      tenure: textValue(raw["Thâm niên"] as ExcelJS.CellValue),
      employmentType: textValue(raw.Type as ExcelJS.CellValue),
      hireDate: hireDate ? parseDate(hireDate) : null,
    };
  }
  if (source.kind === "expense_category_control") {
    const monthlyAmounts = Object.entries(raw)
      .flatMap(([header, value]) => {
        const match = header.match(/^Tháng\s+(\d{1,2})$/);
        if (!match) return [];
        const amountMinor = optionalMoney(value);
        return amountMinor !== null
          ? [{ period: `2025-${match[1]!.padStart(2, "0")}`, amountMinor }]
          : [];
      })
      .sort((left, right) => left.period.localeCompare(right.period));
    return {
      sourceControl,
      category: textValue(raw["Hạng mục chi"] as ExcelJS.CellValue),
      monthlyAmounts,
    };
  }
  return { sourceControl };
};

export function finalizeWorkbookReviewRows(state: WorkbookImportAccumulator): ReviewRow[] {
  const genericClientId = state.party("Generic Client", "client");
  for (const project of state.projects) {
    if (project.clientPartyId !== genericClientId) continue;
    state.issues.push({
      severity: "warning",
      workbook: "projects",
      sheet: "🏔️ Projects",
      row: Number(project.sourceRowIndex),
      field: "Client",
      message: "source workbook has no client field; project remains linked to Generic Client",
    });
  }

  const genericSupplierId = [...state.parties.values()].find(
    (candidate) => candidate.displayName === "Generic Supplier",
  )?.id;
  const invoiceFileCounts = new Map<string, number>();
  for (const source of state.reviewSources) {
    if (source.kind !== "expense") continue;
    const invoiceFile = textValue(source.rawData.invoiceFile as ExcelJS.CellValue);
    if (invoiceFile)
      invoiceFileCounts.set(invoiceFile, (invoiceFileCounts.get(invoiceFile) ?? 0) + 1);
  }
  return state.reviewSources.map((source) => {
    const sourceIdentity = `${source.hash}:${source.sheet}:${source.row}`;
    if (source.kind === "owner_movement") {
      return {
        id: stableId("review", source.hash, source.sheet, source.row),
        sourceIdentity,
        workbook: source.workbook,
        sheet: source.sheet,
        row: source.row,
        kind: source.kind,
        proposedResourceType: "owner_equity_or_transfer_pending",
        status: "posted",
        reviewFlags: ["owner_movement_requires_classification"],
        rawData: source.rawData,
        mappedData: {},
      };
    }
    if (state.controlResourceTypes.has(source.kind)) {
      return {
        id: stableId("review", source.hash, source.sheet, source.row),
        sourceIdentity,
        workbook: source.workbook,
        sheet: source.sheet,
        row: source.row,
        kind: source.kind,
        proposedResourceType: state.controlResourceTypes.get(source.kind)!,
        status: "posted",
        reviewFlags: ["control_only"],
        rawData: source.rawData,
        mappedData: mapWorkbookControl(source),
      };
    }
    const mapped =
      source.kind === "project"
        ? state.projects.find((item) => item.sourceRowIndex === source.row)
        : source.kind === "sales"
          ? state.salesInvoices.find((item) => item.sourceRowIndex === source.row)
          : state.expenses.find((item) => item.sourceRowIndex === source.row);
    const flags: string[] = [];
    if (source.kind === "project") {
      if (mapped?.clientPartyId === genericClientId) flags.push("generic_client");
      if (mapped?.budgetMinor === "0" && !source.rawData.projectCost) flags.push("missing_budget");
      const serviceLine = inferReviewedProjectServiceLine([
        textValue(source.rawData.projectType as ExcelJS.CellValue),
        textValue(source.rawData.package as ExcelJS.CellValue),
      ]);
      if (serviceLine.reviewFlag) flags.push(serviceLine.reviewFlag);
    } else if (source.kind === "sales") {
      if (mapped?.partyId === genericClientId) flags.push("generic_client");
      if (!mapped?.projectId) flags.push("missing_project");
    } else {
      if (genericSupplierId && mapped?.payeePartyId === genericSupplierId)
        flags.push("generic_payee");
      if (mapped?.amountMinor === "0") flags.push("zero_value");
      const invoiceFile = textValue(source.rawData.invoiceFile as ExcelJS.CellValue);
      if (invoiceFile && (invoiceFileCounts.get(invoiceFile) ?? 0) > 1)
        flags.push("duplicate_invoice_file_reference");
      if (!source.rawData.invoiceDate) flags.push("invoice_date_inferred_from_transaction_date");
      flags.push("purchase_tax_review_required");
    }
    const proposedResourceType =
      source.kind === "project"
        ? "project"
        : source.kind === "sales"
          ? "sales_invoice"
          : "purchase_invoice";
    return {
      id: stableId("review", source.hash, source.sheet, source.row),
      sourceIdentity,
      workbook: source.workbook,
      sheet: source.sheet,
      row: source.row,
      kind: source.kind,
      proposedResourceType,
      ...(mapped?.id ? { proposedResourceId: String(mapped.id) } : {}),
      status: "posted",
      reviewFlags: flags,
      rawData: source.rawData,
      mappedData: mapped ?? {},
    };
  });
}
