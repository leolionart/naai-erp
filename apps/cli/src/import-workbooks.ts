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
  const salesInvoices: Record<string, unknown>[] = [];
  const expenses: Record<string, unknown>[] = [];
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
          projects.push({
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
              textValue(row.getCell(4).value).toLowerCase() === "done" ? "completed" : "active",
            sourceRowIndex: rowNumber,
          });
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
      if (
        !textValue(row.getCell(2).value) &&
        textValue(row.getCell(7).value).toLocaleLowerCase("vi").includes("cá nhân")
      ) {
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
      salesInvoices.push({
        id,
        documentNumber: `WB-${id.slice(-16).toUpperCase()}`,
        partyId: party(textValue(row.getCell(9).value), "client"),
        documentDate: date,
        dueDate: date,
        currency: "VND",
        netMinor: net.toString(),
        taxMinor: tax.toString(),
        grossMinor: gross.toString(),
        controlAccountCode: "131",
        sourceRowIndex: rowNumber,
        sourceIdentity: `${hash}:Doanh thu:${rowNumber}`,
      });
    });
    parseRows("Chi phí", (row, rowNumber) => {
      const date = parseDate(row.getCell(1).value);
      const gross = parseMoney(row.getCell(2).value);
      const tax = parseMoney(row.getCell(7).value);
      const type = textValue(row.getCell(9).value) || "Chi phí vận hành";
      const id = stableId("expense", hash, "Chi phí", rowNumber);
      const lower = type.toLocaleLowerCase("vi");
      const expenseClass =
        lower.includes("lương") || lower.includes("thưởng")
          ? "payroll_personnel"
          : lower.includes("thuế")
            ? "tax_payment"
            : lower.includes("phí")
              ? "platform_fee"
              : "petty_cash";
      expenses.push({
        id,
        amountMinor: gross.toString(),
        taxMinor: tax.toString(),
        date,
        class: expenseClass,
        payeePartyId: party(textValue(row.getCell(10).value), "supplier"),
        businessPurpose: textValue(row.getCell(14).value) || type,
        currency: "VND",
        sourceRowIndex: rowNumber,
        sourceIdentity: `${hash}:Chi phí:${rowNumber}`,
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
  }

  return {
    mappingVersion: 1,
    sources,
    inventory,
    issues,
    controls,
    varianceRules: [],
    parties: [...parties.values()],
    projects,
    salesInvoices,
    expenses,
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
