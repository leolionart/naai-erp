import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import type { NaaiErpClient } from "./client.js";

type SourceIssue = Readonly<{
  severity: "error" | "warning";
  workbook: string;
  sheet: string;
  row?: number;
  field?: string;
  message: string;
}>;

type SheetInventory = Readonly<{
  workbook: string;
  sheet: string;
  rowCount: number;
  dataRowCount: number;
  formulaCellCount: number;
  disposition: "projects" | "sales" | "expenses" | "control" | "reference";
}>;

type ControlTreatment = Readonly<{
  sourceSheet: "Doanh thu" | "Chi phí";
  sourceRow: number;
  controlYear: 2025;
  controlMonth: number | null;
  included: boolean;
  classification: string;
  evidence: string;
}>;

type ImportedSalesInvoice = Record<string, unknown> &
  Readonly<{
    documentDate: string;
    netMinor: string;
    legacyControlTreatment: ControlTreatment;
  }>;

type ImportedExpense = Record<string, unknown> &
  Readonly<{
    date: string;
    amountMinor: string;
    taxMinor: string;
    sourceMetadata: Readonly<{
      manualCost: string;
      cashMinor: string | null;
      vatRate: string;
      invoiceDate: string;
      department: string;
      fundingSource: string;
      monthLabel: string;
      invoiceFile: string;
      sourceExpenseType: string;
      supplierDisplayName: string | null;
      supplierInferenceSource: "personnel" | "note" | "category_default" | "unresolved";
      categoryCode: string;
      categoryLabel: string;
      categoryInferenceSource: "expense_type" | "note" | "fallback";
    }>;
    legacyControlTreatment: ControlTreatment;
  }>;

type ReviewRow = Readonly<{
  id: string;
  sourceIdentity: string;
  workbook: "projects" | "finance";
  sheet: string;
  row: number;
  kind:
    | "project"
    | "sales"
    | "expense"
    | "owner_movement"
    | "debt_control"
    | "profitability_control"
    | "planning_control"
    | "bonus_control"
    | "payroll_master"
    | "expense_category_control";
  proposedResourceType:
    | "project"
    | "sales_invoice"
    | "purchase_invoice"
    | "owner_equity_or_transfer_pending"
    | "ar_control"
    | "profitability_control"
    | "planning_control"
    | "bonus_control"
    | "workforce_profile_pending"
    | "expense_category_control";
  proposedResourceId?: string;
  status: "pending_review" | "posted" | "ignored";
  reviewFlags: string[];
  rawData: Record<string, unknown>;
  mappedData: Record<string, unknown>;
}>;

type WorkbookControlMappedData = Readonly<{
  sourceControl: Readonly<{ workbook: "finance"; sheet: string; row: number }>;
  period?: string | undefined;
  projectLabel?: string;
  personName?: string;
  category?: string;
  debtMinor?: string;
  projectCostMinor?: string;
  collectedMinor?: string | null;
  revenueMinor?: string;
  receivedMinor?: string;
  expenseMinor?: string;
  profitMinor?: string;
  forecastExpenseMinor?: string | null;
  forecastCashMinor?: string | null;
  targetAttainmentBps?: number | null;
  bonusMinor?: string;
  payrollNetMinor?: string;
  employmentStatus?: string;
  department?: string;
  tenure?: string;
  employmentType?: string;
  hireDate?: string | null;
  monthlyAmounts?: readonly Readonly<{ period: string; amountMinor: string }>[];
}>;

const REVIEWED_SALES_PROJECT_ROWS = new Map<number, number>([
  [5, 9],
  [21, 7],
  [22, 18],
  [33, 7],
  [39, 7],
]);

type ExpenseCategoryInference = Readonly<{
  code: string;
  label: string;
  source: "expense_type" | "note" | "fallback";
}>;

const normalizeForInference = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi");

const expenseCategoryRules: readonly Readonly<{
  code: string;
  label: string;
  patterns: readonly string[];
}>[] = [
  { code: "PAYROLL", label: "Lương và nhân sự", patterns: ["luong", "freelance"] },
  { code: "BONUS", label: "Thưởng", patterns: ["thuong"] },
  {
    code: "MEALS_ENTERTAINMENT",
    label: "Ăn uống và tiếp khách",
    patterns: ["nha hang", "an uong", "pizza", "bbq", "kichi", "mcd premium", "golden gate"],
  },
  {
    code: "EV_BATTERY_CHARGING",
    label: "Thuê pin và sạc xe điện",
    patterns: ["thue pin", "vinfast", "v-green", "tram sac"],
  },
  {
    code: "INTERNET_TELECOM",
    label: "Internet và viễn thông",
    patterns: ["internet", "vien thong fpt"],
  },
  {
    code: "ELECTRONICS_EQUIPMENT",
    label: "Thiết bị điện tử",
    patterns: ["thiet bi dien tu", "dien thoai di dong", "mobile", "macstore", "dien may xanh"],
  },
  {
    code: "ELECTRICITY_UTILITIES",
    label: "Điện và tiện ích",
    patterns: ["tien dien", "dien luc"],
  },
  {
    code: "TAXES_FEES",
    label: "Thuế và phí",
    patterns: ["thue & phi", "thue mon bai", "nop thue", "tien phat"],
  },
  {
    code: "CASH_TRANSFER",
    label: "Tiền mặt và điều chuyển",
    patterns: ["rut tien mat", "so tiet kiem"],
  },
  {
    code: "OFFICE_FURNISHINGS",
    label: "Trang trí và nội thất văn phòng",
    patterns: ["trang tri van phong", "noi that"],
  },
  {
    code: "DOMAIN_SOFTWARE",
    label: "Tên miền và phần mềm",
    patterns: ["mua domain", "p.a viet nam"],
  },
  {
    code: "CLOUD_DIGITAL_SERVICES",
    label: "Máy chủ và dịch vụ số",
    patterns: ["dich vu may chu", "freepik", "giza network"],
  },
  { code: "DEPOSIT_REFUND", label: "Hoàn tiền đặt cọc", patterns: ["hoan tien coc"] },
  { code: "TRAVEL_TRANSPORT", label: "Đi lại và vận chuyển", patterns: ["vexere", "vjs viet nam"] },
  {
    code: "HEALTH_WELLNESS",
    label: "Y tế và chăm sóc sức khỏe",
    patterns: ["y te", "tham my", "medical"],
  },
  { code: "SPORTS_RECREATION", label: "Thể thao và phúc lợi", patterns: ["vnb sports", "hinoko"] },
];

const inferExpenseCategory = (expenseType: string, note: string): ExpenseCategoryInference => {
  const normalizedType = normalizeForInference(expenseType);
  const normalizedNote = normalizeForInference(note);
  for (const rule of expenseCategoryRules) {
    if (normalizedType && rule.patterns.some((pattern) => normalizedType.includes(pattern)))
      return { code: rule.code, label: rule.label, source: "expense_type" };
  }
  for (const rule of expenseCategoryRules) {
    if (rule.patterns.some((pattern) => normalizedNote.includes(pattern)))
      return { code: rule.code, label: rule.label, source: "note" };
  }
  return { code: "OTHER_OPERATING", label: "Chi phí vận hành khác", source: "fallback" };
};

const inferSupplier = (
  personnel: string,
  note: string,
  categoryCode: string,
): Readonly<{
  name: string | null;
  source: "personnel" | "note" | "category_default" | "unresolved";
}> => {
  if (personnel.trim()) return { name: personnel.trim(), source: "personnel" };
  const noteLines = note
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const supplierLines: string[] = [];
  for (const line of noteLines) {
    if (/^-{3,}$/.test(line) || /^\s*[\d.,]+\s*(vnd|eur|€)?\s*$/iu.test(line)) break;
    supplierLines.push(line);
  }
  if (supplierLines.length > 0) return { name: supplierLines.join(" "), source: "note" };
  if (categoryCode === "TAXES_FEES") return { name: "Cơ quan thuế", source: "category_default" };
  return { name: null, source: "unresolved" };
};

const textValue = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("result" in value) return textValue(value.result as ExcelJS.CellValue);
    if ("text" in value && typeof value.text === "string") return value.text;
  }
  return String(value).trim();
};

function parseDate(value: ExcelJS.CellValue): string {
  const resolved = value && typeof value === "object" && "result" in value ? value.result : value;
  if (resolved instanceof Date && !Number.isNaN(resolved.valueOf())) {
    return resolved.toISOString().slice(0, 10);
  }
  const raw = textValue(resolved as ExcelJS.CellValue);
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1]!;
  const vietnamese = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (vietnamese) {
    return `${vietnamese[3]}-${vietnamese[2]!.padStart(2, "0")}-${vietnamese[1]!.padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.valueOf())) return parsed.toISOString().slice(0, 10);
  throw new Error(`invalid date ${JSON.stringify(raw)}`);
}

function parseMoney(value: ExcelJS.CellValue): bigint {
  if (value === null || value === undefined || value === "") throw new Error("missing money value");
  if (typeof value === "object" && "formula" in value) {
    if (value.result === undefined || value.result === null) {
      throw new Error(`formula has no cached result: ${value.formula}`);
    }
    return parseMoney(value.result as ExcelJS.CellValue);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error(`money is not an exact integer: ${value}`);
    return BigInt(value);
  }
  if (typeof value === "bigint") return value;
  const raw = textValue(value);
  const negative = /^\s*-/.test(raw);
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) throw new Error(`invalid money ${JSON.stringify(raw)}`);
  return BigInt(`${negative ? "-" : ""}${digits}`);
}

const optionalMoney = (value: unknown): string | null => {
  const raw = textValue(value as ExcelJS.CellValue);
  return raw ? parseMoney(value as ExcelJS.CellValue).toString() : null;
};

const controlPeriod = (value: unknown): string | undefined => {
  const raw = textValue(value as ExcelJS.CellValue);
  const exact = raw.match(/^(\d{4})-(\d{1,2})$/);
  if (exact) return `${exact[1]}-${exact[2]!.padStart(2, "0")}`;
  const month = raw.match(/^(\d{1,2})$/);
  if (month && Number(month[1]) >= 1 && Number(month[1]) <= 12)
    return `2025-${month[1]!.padStart(2, "0")}`;
  const date = raw.match(/^(\d{4})-(\d{2})-\d{2}/);
  return date ? `${date[1]}-${date[2]}` : undefined;
};

const targetAttainmentBps = (value: unknown): number | null => {
  const raw = textValue(value as ExcelJS.CellValue).replace(/\s/g, "");
  if (!raw) return null;
  const numeric = Number(raw.replace("%", "").replace(",", "."));
  if (!Number.isFinite(numeric)) return null;
  const percentage = raw.includes("%") ? numeric : Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
  return Math.round(percentage * 100);
};

const mapWorkbookControl = (source: {
  workbook: "projects" | "finance";
  sheet: string;
  row: number;
  kind: ReviewRow["kind"];
  rawData: Record<string, unknown>;
}): WorkbookControlMappedData => {
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

const stableId = (kind: string, workbookHash: string, sheet: string, row: number) =>
  `${kind}-${createHash("sha256").update(`${workbookHash}:${sheet}:${row}`).digest("hex").slice(0, 24)}`;

const countFormulas = (sheet: ExcelJS.Worksheet) => {
  let count = 0;
  sheet.eachRow({ includeEmpty: false }, (row) =>
    row.eachCell((cell) => {
      if (cell.value && typeof cell.value === "object" && "formula" in cell.value) count += 1;
    }),
  );
  return count;
};

export async function buildWorkbookImportPayload(
  projectWorkbookPath?: string,
  financeWorkbookPath?: string,
) {
  if (!projectWorkbookPath && !financeWorkbookPath) {
    throw new Error("workbook-import requires --project-workbook and/or --finance-workbook");
  }
  const issues: SourceIssue[] = [];
  const inventory: SheetInventory[] = [];
  const parties = new Map<
    string,
    { id: string; displayName: string; normalizedTaxId: null; status: "active"; roles: string[] }
  >();
  const projects: Record<string, unknown>[] = [];
  const projectsBySourceRow = new Map<number, Record<string, unknown>>();
  const salesInvoices: ImportedSalesInvoice[] = [];
  const expenses: ImportedExpense[] = [];
  const reviewSources: {
    workbook: "projects" | "finance";
    sheet: string;
    row: number;
    hash: string;
    kind: ReviewRow["kind"];
    rawData: Record<string, unknown>;
  }[] = [];
  const controlResourceTypes = new Map<ReviewRow["kind"], ReviewRow["proposedResourceType"]>();
  const controls: {
    workbook: string;
    sheet: string;
    year: number;
    salesMinor: string;
    expenseMinor: string;
    profitMinor: string;
  }[] = [];
  const sources: { kind: "projects" | "finance"; sha256: string; filename: string }[] = [];

  const party = (name: string, role: "client" | "supplier") => {
    const normalized = name.trim() || (role === "client" ? "Generic Client" : "Generic Supplier");
    const id = `party-${createHash("sha256").update(normalized.toLocaleLowerCase("vi")).digest("hex").slice(0, 24)}`;
    const current = parties.get(id);
    if (current && !current.roles.includes(role)) current.roles.push(role);
    else if (!current)
      parties.set(id, {
        id,
        displayName: normalized,
        normalizedTaxId: null,
        status: "active",
        roles: [role],
      });
    return id;
  };

  if (projectWorkbookPath) {
    const bytes = await readFile(projectWorkbookPath);
    const hash = createHash("sha256").update(bytes).digest("hex");
    sources.push({
      kind: "projects",
      sha256: hash,
      filename: projectWorkbookPath.split("/").at(-1)!,
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    for (const sheet of workbook.worksheets) {
      const disposition = sheet.name === "🏔️ Projects" ? "projects" : "reference";
      inventory.push({
        workbook: "projects",
        sheet: sheet.name,
        rowCount: sheet.rowCount,
        dataRowCount: Math.max(0, sheet.rowCount - 1),
        formulaCellCount: countFormulas(sheet),
        disposition,
      });
    }
    const sheet = workbook.getWorksheet("🏔️ Projects");
    if (!sheet)
      issues.push({
        severity: "error",
        workbook: "projects",
        sheet: "🏔️ Projects",
        message: "required sheet is missing",
      });
    else {
      for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        const name = textValue(row.getCell(1).value);
        if (!name) {
          issues.push({
            severity: "error",
            workbook: "projects",
            sheet: sheet.name,
            row: rowNumber,
            field: "Project Name",
            message: "row has no project name",
          });
          continue;
        }
        try {
          reviewSources.push({
            workbook: "projects",
            sheet: "🏔️ Projects",
            row: rowNumber,
            hash,
            kind: "project",
            rawData: {
              projectName: name,
              groupChat: textValue(row.getCell(2).value),
              participants: textValue(row.getCell(3).value),
              projectStage: textValue(row.getCell(4).value),
              startDate: textValue(row.getCell(5).value),
              endDate: textValue(row.getCell(6).value),
              taskDone: textValue(row.getCell(7).value),
              projectCost: textValue(row.getCell(8).value),
              projectTimeDays: textValue(row.getCell(9).value),
              workloadHours: textValue(row.getCell(10).value),
              projectType: textValue(row.getCell(11).value),
              package: textValue(row.getCell(12).value),
              projectLink: textValue(row.getCell(13).value),
              notes: textValue(row.getCell(14).value),
              ctvRefCost: textValue(row.getCell(15).value),
              sourceMonth: textValue(row.getCell(16).value),
            },
          });
          const startsOn = parseDate(row.getCell(5).value);
          const endRaw = row.getCell(6).value;
          const endsOn = textValue(endRaw) ? parseDate(endRaw) : null;
          const id = stableId("project", hash, sheet.name, rowNumber);
          const budgetRaw = row.getCell(8).value;
          if (!textValue(budgetRaw))
            issues.push({
              severity: "warning",
              workbook: "projects",
              sheet: sheet.name,
              row: rowNumber,
              field: "Project Cost",
              message: "missing project cost mapped explicitly to zero",
            });
          const sourceStage = textValue(row.getCell(4).value);
          const project = {
            id,
            code: `IMP${id.slice(-17).toUpperCase()}`,
            name: `${name}${textValue(row.getCell(14).value) ? ` — ${textValue(row.getCell(14).value)}` : ""}`,
            clientPartyId: party("Generic Client", "client"),
            ownerUserId: "user-import",
            contractType: "fixed_fee",
            currency: "VND",
            budgetMinor: textValue(budgetRaw) ? parseMoney(budgetRaw).toString() : "0",
            startsOn,
            endsOn,
            state:
              sourceStage.toLowerCase() === "done"
                ? "completed"
                : sourceStage.toLowerCase() === "ended"
                  ? "closed"
                  : "active",
            sourceStage,
            sourceRowIndex: rowNumber,
            sourceMetadata: {
              groupChat: textValue(row.getCell(2).value),
              participants: textValue(row.getCell(3).value),
              taskDone: textValue(row.getCell(7).value),
              projectTimeDays: textValue(row.getCell(9).value),
              workloadHours: textValue(row.getCell(10).value),
              projectType: textValue(row.getCell(11).value),
              package: textValue(row.getCell(12).value),
              projectLink: textValue(row.getCell(13).value),
              notes: textValue(row.getCell(14).value),
              ctvRefCost: textValue(row.getCell(15).value),
              sourceMonth: textValue(row.getCell(16).value),
            },
          };
          projects.push(project);
          projectsBySourceRow.set(rowNumber, project);
        } catch (error) {
          issues.push({
            severity: "error",
            workbook: "projects",
            sheet: sheet.name,
            row: rowNumber,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  if (financeWorkbookPath) {
    const bytes = await readFile(financeWorkbookPath);
    const hash = createHash("sha256").update(bytes).digest("hex");
    sources.push({
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
      inventory.push({
        workbook: "finance",
        sheet: sheet.name,
        rowCount: sheet.rowCount,
        dataRowCount: Math.max(0, sheet.rowCount - 1),
        formulaCellCount: countFormulas(sheet),
        disposition,
      });
    }
    const parseRows = (
      sheetName: string,
      callback: (row: ExcelJS.Row, rowNumber: number) => void,
    ) => {
      const sheet = workbook.getWorksheet(sheetName);
      if (!sheet) {
        issues.push({
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
          issues.push({
            severity: "error",
            workbook: "finance",
            sheet: sheetName,
            row: rowNumber,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    };
    parseRows("Doanh thu", (row, rowNumber) => {
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
        reviewSources.push({
          workbook: "finance",
          sheet: "Doanh thu",
          row: rowNumber,
          hash,
          kind: "owner_movement",
          rawData: salesRawData,
        });
        issues.push({
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
      const clientPartyId = party(textValue(row.getCell(9).value), "client");
      const mappedProjectSourceRow = REVIEWED_SALES_PROJECT_ROWS.get(rowNumber);
      const mappedProject = mappedProjectSourceRow
        ? projectsBySourceRow.get(mappedProjectSourceRow)
        : undefined;
      if (mappedProject && mappedProjectSourceRow) {
        mappedProject.clientPartyId = clientPartyId;
        issues.push({
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
        issues.push({
          severity: "warning",
          workbook: "finance",
          sheet: "Doanh thu",
          row: rowNumber,
          field: "Tháng",
          message: "legacy profitability control excludes this row because source month is blank",
        });
      } else if (!date.startsWith("2025")) {
        issues.push({
          severity: "warning",
          workbook: "finance",
          sheet: "Doanh thu",
          row: rowNumber,
          field: "Tháng",
          message: `legacy profitability control assigns ${date} transaction to month ${sourceMonth} of its 2025 rollup`,
        });
      }
      salesInvoices.push({
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
      reviewSources.push({
        workbook: "finance",
        sheet: "Doanh thu",
        row: rowNumber,
        hash,
        kind: "sales",
        rawData: salesRawData,
      });
    });
    parseRows("Chi phí", (row, rowNumber) => {
      const date = parseDate(row.getCell(1).value);
      const gross = parseMoney(row.getCell(2).value);
      const tax = parseMoney(row.getCell(7).value);
      const sourceExpenseType = textValue(row.getCell(9).value);
      const note = textValue(row.getCell(14).value);
      const category = inferExpenseCategory(sourceExpenseType, note);
      const supplier = inferSupplier(textValue(row.getCell(10).value), note, category.code);
      const type = sourceExpenseType || category.label;
      reviewSources.push({
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
        issues.push({
          severity: "warning",
          workbook: "finance",
          sheet: "Chi phí",
          row: rowNumber,
          field: "Tháng",
          message: `legacy profitability control assigns ${date} transaction to month ${sourceMonth} of its 2025 rollup`,
        });
      }
      expenses.push({
        id,
        amountMinor: gross.toString(),
        taxMinor: tax.toString(),
        date,
        class: category.code,
        payeePartyId: supplier.name
          ? party(supplier.name, "supplier")
          : party("Generic Supplier", "supplier"),
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
          categoryCode: category.code,
          categoryLabel: category.label,
          categoryInferenceSource: category.source,
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
      controls.push({
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
            ![
              "Lương NET",
              "Status",
              "Name",
              "Department",
              "Thâm niên",
              "Type",
              "Hire date",
            ].includes(header)
          )
            continue;
          rawData[header] = textValue(row.getCell(column).value);
        }
        if (!Object.values(rawData).some((value) => textValue(value as ExcelJS.CellValue)))
          continue;
        reviewSources.push({
          workbook: "finance",
          sheet: sheetName,
          row: rowNumber,
          hash,
          kind,
          rawData,
        });
      }
      controlResourceTypes.set(kind, proposedResourceType);
    };
    stageControlSheet("Công nợ", "debt_control", "ar_control");
    stageControlSheet("Tỷ suất lợi nhuận", "profitability_control", "profitability_control");
    stageControlSheet("Planing & Target", "planning_control", "planning_control");
    stageControlSheet("Tỉ lệ thưởng", "bonus_control", "bonus_control");
    stageControlSheet("Bảng lương", "payroll_master", "workforce_profile_pending");
    stageControlSheet("Hạng mục chi", "expense_category_control", "expense_category_control");
  }

  const genericClientId = party("Generic Client", "client");
  for (const project of projects) {
    if (project.clientPartyId !== genericClientId) continue;
    issues.push({
      severity: "warning",
      workbook: "projects",
      sheet: "🏔️ Projects",
      row: Number(project.sourceRowIndex),
      field: "Client",
      message: "source workbook has no client field; project remains linked to Generic Client",
    });
  }

  const genericSupplierId = [...parties.values()].find(
    (candidate) => candidate.displayName === "Generic Supplier",
  )?.id;
  const invoiceFileCounts = new Map<string, number>();
  for (const source of reviewSources) {
    if (source.kind !== "expense") continue;
    const invoiceFile = textValue(source.rawData.invoiceFile as ExcelJS.CellValue);
    if (invoiceFile)
      invoiceFileCounts.set(invoiceFile, (invoiceFileCounts.get(invoiceFile) ?? 0) + 1);
  }
  const reviewRows: ReviewRow[] = reviewSources.map((source) => {
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
        status: "pending_review",
        reviewFlags: ["owner_movement_requires_classification"],
        rawData: source.rawData,
        mappedData: {},
      };
    }
    if (controlResourceTypes.has(source.kind)) {
      return {
        id: stableId("review", source.hash, source.sheet, source.row),
        sourceIdentity,
        workbook: source.workbook,
        sheet: source.sheet,
        row: source.row,
        kind: source.kind,
        proposedResourceType: controlResourceTypes.get(source.kind)!,
        status: "pending_review",
        reviewFlags: ["control_only"],
        rawData: source.rawData,
        mappedData: mapWorkbookControl(source),
      };
    }
    const mapped =
      source.kind === "project"
        ? projects.find((item) => item.sourceRowIndex === source.row)
        : source.kind === "sales"
          ? salesInvoices.find((item) => item.sourceRowIndex === source.row)
          : expenses.find((item) => item.sourceRowIndex === source.row);
    const flags: string[] = [];
    if (source.kind === "project") {
      if (mapped?.clientPartyId === genericClientId) flags.push("generic_client");
      if (mapped?.budgetMinor === "0" && !source.rawData.projectCost) flags.push("missing_budget");
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
      status: flags.length ? "pending_review" : "posted",
      reviewFlags: flags,
      rawData: source.rawData,
      mappedData: mapped ?? {},
    };
  });

  return {
    mappingVersion: 3,
    sources,
    inventory,
    issues,
    controls,
    varianceRules: [],
    parties: [...parties.values()],
    projects,
    salesInvoices,
    expenses,
    reviewRows,
  };
}

export async function runWorkbookImport(
  client: NaaiErpClient,
  projectWorkbookPath: string | undefined,
  financeWorkbookPath: string | undefined,
  commit: boolean,
): Promise<unknown> {
  const payload = await buildWorkbookImportPayload(projectWorkbookPath, financeWorkbookPath);
  return client.request("workbook-imports", commit ? "commit" : "dry-run", payload);
}
