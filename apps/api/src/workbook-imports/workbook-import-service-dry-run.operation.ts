import { assertWorkbookBaseCurrency } from "../common/base-currency-guard.js";
import type { WorkbookImportPayload } from "./workbook-import.types.js";
import { type ImportOutcome } from "./workbook-import.service.shared.js";
import type { WorkbookImportService } from "./workbook-import.service.js";

export async function dryRunOperation(
  this: WorkbookImportService,
  organizationId: string,
  payload: WorkbookImportPayload,
): Promise<ImportOutcome> {
  await assertWorkbookBaseCurrency(this.pool, organizationId, payload);
  const runtimeIssues: WorkbookImportPayload["issues"][number][] = [...(payload.issues ?? [])];
  const errors: string[] = (payload.issues ?? [])
    .filter((issue) => issue.severity === "error")
    .map(
      (issue) =>
        `${issue.workbook}/${issue.sheet}${issue.row ? ` row ${issue.row}` : ""}: ${issue.message}`,
    );
  if (![1, 2, 3].includes(payload.mappingVersion))
    errors.push(`Unsupported workbook mapping version: ${String(payload.mappingVersion)}`);
  if (!payload.sources?.length) errors.push("At least one workbook source identity is required");
  if (!payload.inventory?.length) errors.push("Workbook sheet inventory is required");
  const identities = new Set<string>();

  // Local structural and domain checks
  const partyIds = new Set<string>();
  const projectIds = new Set<string>();
  const requestedServiceLineCodes = new Set(
    payload.projects
      .flatMap((project) => [project.defaultServiceLineCode, project.default_service_line_code])
      .filter((code): code is string => typeof code === "string" && code.trim().length > 0)
      .map((code) => code.trim()),
  );
  const activeServiceLineCodes = new Set<string>();
  if (requestedServiceLineCodes.size > 0) {
    const result = await this.pool.query<{ code: string }>(
      `select code from dimension_values
       where organization_id=$1 and kind='service_line' and is_active=true and code=any($2::text[])`,
      [organizationId, [...requestedServiceLineCodes]],
    );
    for (const row of result.rows) activeServiceLineCodes.add(row.code);
  }

  for (const party of payload.parties) {
    if (!party.id || !party.displayName) {
      errors.push(`Party is missing id or displayName: ${JSON.stringify(party)}`);
    }
    partyIds.add(party.id);
  }

  for (const project of payload.projects) {
    if (!project.id || !project.code || !project.name) {
      errors.push(`Project is missing id, code or name: ${JSON.stringify(project)}`);
    }
    if (!partyIds.has(project.clientPartyId)) {
      errors.push(
        `Project "${project.name}" references unknown client party ID "${project.clientPartyId}"`,
      );
    }
    const camelCode = project.defaultServiceLineCode?.trim() || null;
    const snakeCode = project.default_service_line_code?.trim() || null;
    if (camelCode && snakeCode && camelCode !== snakeCode) {
      const message = `Project "${project.name}" has conflicting default service line codes "${camelCode}" and "${snakeCode}"`;
      errors.push(message);
      runtimeIssues.push({
        severity: "error",
        workbook: "projects",
        sheet: "Projects",
        field: "default_service_line_code",
        message,
      });
    } else {
      const code = camelCode ?? snakeCode;
      if (code && !activeServiceLineCodes.has(code)) {
        const message = `Project "${project.name}" references unknown or inactive service line code "${code}"`;
        errors.push(message);
        runtimeIssues.push({
          severity: "error",
          workbook: "projects",
          sheet: "Projects",
          field: "default_service_line_code",
          message,
        });
      }
    }
    projectIds.add(project.id);
  }

  let salesSum = 0n;
  let legacySalesSum = 0n;
  let legacyExpenseSum = 0n;
  const legacyComponents: NonNullable<
    ImportOutcome["reconciliation"]["legacyControl"]
  >["components"][number][] = [];
  const validateTreatment = (
    kind: "sales" | "expense",
    sourceIdentity: string,
    sourceRowIndex: number,
    amount: bigint,
    treatment: (typeof payload.salesInvoices)[number]["legacyControlTreatment"],
    expectedSheet: string,
  ) => {
    if (payload.mappingVersion < 2) return;
    if (!treatment) {
      errors.push(`${kind} row ${sourceRowIndex} is missing mapping v2 legacy control treatment`);
      return;
    }
    if (
      treatment.sourceSheet !== expectedSheet ||
      treatment.sourceRow !== sourceRowIndex ||
      !Number.isInteger(treatment.controlYear) ||
      (treatment.controlMonth !== null &&
        (!Number.isInteger(treatment.controlMonth) ||
          treatment.controlMonth < 1 ||
          treatment.controlMonth > 12)) ||
      (treatment.included && treatment.controlMonth === null)
    ) {
      errors.push(
        `${kind} row ${sourceRowIndex} has invalid legacy control source/period evidence`,
      );
    }
    if (!treatment.included && (!treatment.classification?.trim() || !treatment.evidence?.trim())) {
      errors.push(
        `${kind} row ${sourceRowIndex} legacy control exclusion requires classification and evidence`,
      );
    }
    legacyComponents.push({
      kind,
      sourceIdentity,
      sourceSheet: treatment.sourceSheet,
      sourceRow: treatment.sourceRow,
      controlYear: treatment.controlYear,
      controlMonth: treatment.controlMonth,
      amountMinor: amount.toString(),
      included: treatment.included,
      ...(treatment.classification ? { classification: treatment.classification } : {}),
      ...(treatment.evidence ? { evidence: treatment.evidence } : {}),
    });
    if (treatment.included) {
      if (kind === "sales") legacySalesSum += amount;
      else legacyExpenseSum += amount;
    }
  };
  for (const invoice of payload.salesInvoices) {
    if (!invoice.id || !invoice.documentNumber || !invoice.partyId) {
      errors.push(
        `Sales invoice at row ${invoice.sourceRowIndex} is missing id, documentNumber or partyId`,
      );
    }
    if (!partyIds.has(invoice.partyId)) {
      errors.push(
        `Sales invoice ${invoice.documentNumber} at row ${invoice.sourceRowIndex} references unknown party ID "${invoice.partyId}"`,
      );
    }
    if (invoice.projectId && !projectIds.has(invoice.projectId)) {
      errors.push(
        `Sales invoice ${invoice.documentNumber} at row ${invoice.sourceRowIndex} references unknown project ID "${invoice.projectId}"`,
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(invoice.documentDate)) {
      errors.push(
        `Sales invoice ${invoice.documentNumber} at row ${invoice.sourceRowIndex} has invalid document date "${invoice.documentDate}"`,
      );
    }

    if (!invoice.sourceIdentity || identities.has(invoice.sourceIdentity))
      errors.push(
        `Sales invoice at row ${invoice.sourceRowIndex} has missing or duplicate source identity`,
      );
    identities.add(invoice.sourceIdentity);
    let net = 0n,
      tax = 0n,
      gross = 0n;
    try {
      net = BigInt(invoice.netMinor);
      tax = BigInt(invoice.taxMinor);
      gross = BigInt(invoice.grossMinor);
    } catch {
      errors.push(
        `Sales invoice ${invoice.documentNumber} at row ${invoice.sourceRowIndex} has invalid integer money`,
      );
    }
    if (gross !== net + tax) {
      errors.push(
        `Sales invoice ${invoice.documentNumber} at row ${invoice.sourceRowIndex} fails total check: gross (${gross}) != net (${net}) + tax (${tax})`,
      );
    }
    validateTreatment(
      "sales",
      invoice.sourceIdentity,
      invoice.sourceRowIndex,
      net,
      invoice.legacyControlTreatment,
      "Doanh thu",
    );

    // Check if this falls in 2025
    if (invoice.documentDate.startsWith("2025")) {
      salesSum += net;
    }
  }

  let expenseSum = 0n;
  for (const exp of payload.expenses) {
    if (!exp.id || !exp.amountMinor) {
      errors.push(`Expense at row ${exp.sourceRowIndex} is missing id or amountMinor`);
    }
    if (exp.payeePartyId && !partyIds.has(exp.payeePartyId)) {
      errors.push(
        `Expense at row ${exp.sourceRowIndex} references unknown payee party ID "${exp.payeePartyId}"`,
      );
    }
    if (exp.projectId && !projectIds.has(exp.projectId)) {
      errors.push(
        `Expense at row ${exp.sourceRowIndex} references unknown project ID "${exp.projectId}"`,
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exp.date)) {
      errors.push(`Expense at row ${exp.sourceRowIndex} has invalid date "${exp.date}"`);
    }

    // Check if this falls in 2025
    if (!exp.sourceIdentity || identities.has(exp.sourceIdentity))
      errors.push(`Expense at row ${exp.sourceRowIndex} has missing or duplicate source identity`);
    identities.add(exp.sourceIdentity);
    try {
      const gross = BigInt(exp.amountMinor);
      const tax = BigInt(exp.taxMinor || 0);
      if (gross < tax)
        errors.push(`Expense at row ${exp.sourceRowIndex} has tax greater than gross`);
      if (exp.date.startsWith("2025")) expenseSum += gross - tax;
      if (gross === 0n && tax === 0n) {
        runtimeIssues.push({
          severity: "warning",
          workbook: "finance",
          sheet: exp.legacyControlTreatment?.sourceSheet ?? "Chi phí",
          row: exp.sourceRowIndex,
          field: "Tổng chi phí",
          message: "zero-total source row retained for reconciliation and skipped on commit",
        });
      }
      validateTreatment(
        "expense",
        exp.sourceIdentity,
        exp.sourceRowIndex,
        gross - tax,
        exp.legacyControlTreatment,
        "Chi phí",
      );
    } catch {
      errors.push(`Expense at row ${exp.sourceRowIndex} has invalid integer money`);
    }
  }

  const profitSum = salesSum - expenseSum;
  const legacyProfitSum = legacySalesSum - legacyExpenseSum;
  const variances: ImportOutcome["reconciliation"]["variances"][number][] = [];
  for (const control of payload.controls ?? []) {
    const detail = {
      sales:
        payload.mappingVersion >= 2
          ? legacyComponents
              .filter(
                (item) =>
                  item.kind === "sales" && item.included && item.controlYear === control.year,
              )
              .reduce((sum, item) => sum + BigInt(item.amountMinor), 0n)
          : control.year === 2025
            ? salesSum
            : 0n,
      expense:
        payload.mappingVersion >= 2
          ? legacyComponents
              .filter(
                (item) =>
                  item.kind === "expense" && item.included && item.controlYear === control.year,
              )
              .reduce((sum, item) => sum + BigInt(item.amountMinor), 0n)
          : control.year === 2025
            ? expenseSum
            : 0n,
      profit: 0n,
    };
    detail.profit = detail.sales - detail.expense;
    for (const metric of ["sales", "expense", "profit"] as const) {
      const controlMinor = BigInt(control[`${metric}Minor`]);
      const variance = controlMinor - detail[metric];
      if (variance === 0n) continue;
      const rule = (payload.varianceRules ?? []).find(
        (candidate) =>
          payload.mappingVersion === 1 &&
          candidate.mappingVersion === 1 &&
          candidate.sheet === control.sheet &&
          candidate.metric === metric &&
          BigInt(candidate.varianceMinor) === variance,
      );
      variances.push({
        sheet: control.sheet,
        year: control.year,
        metric,
        detailMinor: detail[metric].toString(),
        controlMinor: controlMinor.toString(),
        varianceMinor: variance.toString(),
        ...(rule ? { classifiedBy: rule.id } : {}),
      });
      if (!rule)
        errors.push(
          `Unexplained control variance ${control.sheet}/${control.year}/${metric}: ${variance}`,
        );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    issues: runtimeIssues,
    reconciliation: {
      totalSales: salesSum.toString(),
      totalExpense: expenseSum.toString(),
      totalProfit: profitSum.toString(),
      controls: payload.controls ?? [],
      variances,
      ...(payload.mappingVersion >= 2
        ? {
            legacyControl: {
              totalSales: legacySalesSum.toString(),
              totalExpense: legacyExpenseSum.toString(),
              totalProfit: legacyProfitSum.toString(),
              components: legacyComponents,
            },
          }
        : {}),
    },
    coverage: {
      inventory: payload.inventory ?? [],
      sourceRows: {
        projects: payload.projects.length,
        sales: payload.salesInvoices.length,
        expenses: payload.expenses.length,
      },
    },
  };
}
