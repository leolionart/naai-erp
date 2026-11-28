import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import {
  countFormulas,
  parseDate,
  parseMoney,
  stableId,
  textValue,
} from "./import-workbooks-cell-values.js";
import { inferReviewedProjectServiceLine } from "./import-workbooks-classifications.js";
import type { WorkbookImportAccumulator } from "./import-workbooks-types.js";

export async function ingestProjectWorkbook(
  projectWorkbookPath: string,
  state: WorkbookImportAccumulator,
): Promise<void> {
  const bytes = await readFile(projectWorkbookPath);
  const hash = createHash("sha256").update(bytes).digest("hex");
  state.sources.push({
    kind: "projects",
    sha256: hash,
    filename: projectWorkbookPath.split("/").at(-1)!,
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  for (const sheet of workbook.worksheets) {
    const disposition = sheet.name === "🏔️ Projects" ? "projects" : "reference";
    state.inventory.push({
      workbook: "projects",
      sheet: sheet.name,
      rowCount: sheet.rowCount,
      dataRowCount: Math.max(0, sheet.rowCount - 1),
      formulaCellCount: countFormulas(sheet),
      disposition,
    });
  }
  const sheet = workbook.getWorksheet("🏔️ Projects");
  if (!sheet) {
    state.issues.push({
      severity: "error",
      workbook: "projects",
      sheet: "🏔️ Projects",
      message: "required sheet is missing",
    });
    return;
  }
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const name = textValue(row.getCell(1).value);
    if (!name) {
      state.issues.push({
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
      state.reviewSources.push({
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
        state.issues.push({
          severity: "warning",
          workbook: "projects",
          sheet: sheet.name,
          row: rowNumber,
          field: "Project Cost",
          message: "missing project cost mapped explicitly to zero",
        });
      const sourceStage = textValue(row.getCell(4).value);
      const sourceProjectType = textValue(row.getCell(11).value);
      const sourcePackage = textValue(row.getCell(12).value);
      const serviceLine = inferReviewedProjectServiceLine([sourceProjectType, sourcePackage]);
      const project = {
        id,
        code: `IMP${id.slice(-17).toUpperCase()}`,
        name: `${name}${textValue(row.getCell(14).value) ? ` — ${textValue(row.getCell(14).value)}` : ""}`,
        clientPartyId: state.party("Generic Client", "client"),
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
        ...(serviceLine.code ? { defaultServiceLineCode: serviceLine.code } : {}),
        sourceRowIndex: rowNumber,
        sourceMetadata: {
          groupChat: textValue(row.getCell(2).value),
          participants: textValue(row.getCell(3).value),
          taskDone: textValue(row.getCell(7).value),
          projectTimeDays: textValue(row.getCell(9).value),
          workloadHours: textValue(row.getCell(10).value),
          projectType: sourceProjectType,
          package: sourcePackage,
          serviceLineMapping: serviceLine.code
            ? { code: serviceLine.code, source: "reviewed_exact_alias_v1" }
            : { code: null, reviewFlag: serviceLine.reviewFlag },
          projectLink: textValue(row.getCell(13).value),
          notes: textValue(row.getCell(14).value),
          ctvRefCost: textValue(row.getCell(15).value),
          sourceMonth: textValue(row.getCell(16).value),
        },
      };
      state.projects.push(project);
      state.projectsBySourceRow.set(rowNumber, project);
    } catch (error) {
      state.issues.push({
        severity: "error",
        workbook: "projects",
        sheet: sheet.name,
        row: rowNumber,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
