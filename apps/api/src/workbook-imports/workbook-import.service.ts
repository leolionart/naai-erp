import { Injectable } from "@nestjs/common";
import pg from "pg";
import { createHash, randomUUID } from "node:crypto";
import type {
  UpdateWorkbookImportReviewRowInput,
  WorkbookImportPayload,
  WorkbookImportReviewStatus,
} from "./workbook-import.types.js";

const REVIEW_ROLES = new Set(["owner", "finance_admin", "accountant"]);

type ReviewRowRecord = {
  id: string;
  import_identity: string;
  source_identity: string;
  workbook: string;
  sheet: string;
  source_row: number;
  kind: string;
  proposed_resource_type: string;
  proposed_resource_id: string | null;
  status: WorkbookImportReviewStatus;
  review_flags: unknown;
  raw_data: unknown;
  mapped_data: unknown;
  resolution: unknown;
  notes: string | null;
  version: string;
  created_by: string;
  updated_by: string;
  created_at: Date | string;
  updated_at: Date | string;
};

export type ImportOutcome = {
  valid: boolean;
  errors: readonly string[];
  issues: WorkbookImportPayload["issues"];
  reconciliation: {
    totalSales: string;
    totalExpense: string;
    totalProfit: string;
    controls: readonly Readonly<{
      sheet: string;
      year: number;
      salesMinor: string;
      expenseMinor: string;
      profitMinor: string;
    }>[];
    variances: readonly Readonly<{
      sheet: string;
      year: number;
      metric: "sales" | "expense" | "profit";
      detailMinor: string;
      controlMinor: string;
      varianceMinor: string;
      classifiedBy?: string;
    }>[];
    legacyControl?: Readonly<{
      totalSales: string;
      totalExpense: string;
      totalProfit: string;
      components: readonly Readonly<{
        kind: "sales" | "expense";
        sourceIdentity: string;
        sourceSheet: string;
        sourceRow: number;
        controlYear: number;
        controlMonth: number | null;
        amountMinor: string;
        included: boolean;
        classification?: string;
        evidence?: string;
      }>[];
    }>;
  };
  details?: {
    partiesCreated: number;
    projectsCreated: number;
    salesInvoicesCreated: number;
    expensesCreated: number;
    expensesSkipped: number;
    auditEventId: string;
  };
  coverage: {
    inventory: WorkbookImportPayload["inventory"];
    sourceRows: { projects: number; sales: number; expenses: number };
  };
};

@Injectable()
export class WorkbookImportService {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  private requireReviewRole(roles: readonly string[]) {
    if (!roles.some((role) => REVIEW_ROLES.has(role))) throw new Error("FORBIDDEN");
  }

  private reviewRow(row: ReviewRowRecord) {
    return {
      id: row.id,
      importIdentity: row.import_identity,
      sourceIdentity: row.source_identity,
      workbook: row.workbook,
      sheet: row.sheet,
      sourceRow: row.source_row,
      kind: row.kind,
      proposedResourceType: row.proposed_resource_type,
      proposedResourceId: row.proposed_resource_id,
      status: row.status,
      reviewFlags: row.review_flags,
      rawData: row.raw_data,
      mappedData: row.mapped_data,
      resolution: row.resolution,
      notes: row.notes,
      resourceVersion: row.version,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async listReviewRows(organizationId: string, roles: readonly string[]) {
    this.requireReviewRole(roles);
    const result = await this.pool.query<ReviewRowRecord>(
      `select * from workbook_import_review_rows
       where organization_id=$1 order by workbook,sheet,source_row,id`,
      [organizationId],
    );
    return result.rows.map((row) => this.reviewRow(row));
  }

  async getReviewRow(organizationId: string, id: string, roles: readonly string[]) {
    this.requireReviewRole(roles);
    const result = await this.pool.query<ReviewRowRecord>(
      `select * from workbook_import_review_rows where organization_id=$1 and id=$2`,
      [organizationId, id],
    );
    if (!result.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    return this.reviewRow(result.rows[0]);
  }

  async updateReviewRow(
    organizationId: string,
    id: string,
    expectedVersion: string,
    input: UpdateWorkbookImportReviewRowInput,
    actorId: string,
    roles: readonly string[],
    correlationId: string,
  ) {
    this.requireReviewRole(roles);
    if (!expectedVersion) throw new Error("VERSION_CONFLICT");
    if (
      input.status !== undefined &&
      !["pending_review", "approved", "ignored", "posted"].includes(input.status)
    )
      throw new Error("VALIDATION_FAILED");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const current = await client.query<ReviewRowRecord>(
        `select * from workbook_import_review_rows
         where organization_id=$1 and id=$2 for update`,
        [organizationId, id],
      );
      const before = current.rows[0];
      if (!before) throw new Error("RESOURCE_NOT_FOUND");
      if (before.version !== expectedVersion) throw new Error("VERSION_CONFLICT");
      const updated = await client.query<ReviewRowRecord>(
        `update workbook_import_review_rows set
           mapped_data=coalesce($3::jsonb,mapped_data),
           resolution=coalesce($4::jsonb,resolution),
           status=coalesce($5::workbook_import_review_status,status),
           notes=case when $6::boolean then $7::text else notes end,
           version=version+1,updated_by=$8,updated_at=now()
         where organization_id=$1 and id=$2 and version=$9::bigint returning *`,
        [
          organizationId,
          id,
          input.mappedData === undefined ? null : JSON.stringify(input.mappedData),
          input.resolution === undefined ? null : JSON.stringify(input.resolution),
          input.status ?? null,
          input.notes !== undefined,
          input.notes ?? null,
          actorId,
          expectedVersion,
        ],
      );
      if (!updated.rows[0]) throw new Error("VERSION_CONFLICT");
      await client.query(
        `insert into resource_audit_events
          (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
         values ($1,$2,'workbook_import_review_row',$3,$4,'update',$5,$6,$7::jsonb,$8::jsonb)`,
        [
          organizationId,
          randomUUID(),
          id,
          updated.rows[0].version,
          actorId,
          correlationId,
          JSON.stringify(this.reviewRow(before)),
          JSON.stringify(this.reviewRow(updated.rows[0])),
        ],
      );
      await client.query("commit");
      return this.reviewRow(updated.rows[0]);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async authenticate(
    rawToken: string,
    organizationId: string,
    _correlationId: string,
  ): Promise<{ actorId: string; roles: readonly string[] }> {
    const result = await this.pool.query<{ actor_id: string; roles: string[] }>(
      `select actor_id, roles from api_credentials
       where organization_id=$1 and token_hash=$2 and status='active'
         and (expires_at is null or expires_at > now())`,
      [organizationId, createHash("sha256").update(rawToken).digest("hex")],
    );
    const row = result.rows[0];
    if (!row) throw new Error("UNAUTHORIZED");
    return { actorId: row.actor_id, roles: row.roles };
  }

  async dryRun(organizationId: string, payload: WorkbookImportPayload): Promise<ImportOutcome> {
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
      if (
        !treatment.included &&
        (!treatment.classification?.trim() || !treatment.evidence?.trim())
      ) {
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
        errors.push(
          `Expense at row ${exp.sourceRowIndex} has missing or duplicate source identity`,
        );
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

  async commit(
    organizationId: string,
    payload: WorkbookImportPayload,
    actorId: string,
    correlationId: string,
  ): Promise<ImportOutcome> {
    // 1. Dry run verification
    const dryRunResult = await this.dryRun(organizationId, payload);
    if (!dryRunResult.valid) {
      return {
        valid: false,
        errors: [...dryRunResult.errors, "Commit aborted due to validation errors"],
        issues: dryRunResult.issues,
        reconciliation: dryRunResult.reconciliation,
        coverage: dryRunResult.coverage,
      };
    }

    // 2. Perform transaction mutations
    const importIdentity = createHash("sha256")
      .update(JSON.stringify(payload.sources))
      .digest("hex");
    const client = await this.pool.connect();
    let auditEventId: string = randomUUID();

    let partiesCreated = 0;
    let projectsCreated = 0;
    let salesInvoicesCreated = 0;
    let expensesCreated = 0;
    let expensesSkipped = 0;

    try {
      await client.query("begin");

      // 2.0 Review staging. These rows never create journals by themselves.
      for (const row of payload.reviewRows ?? []) {
        await client.query(
          `insert into workbook_import_review_rows
            (organization_id,id,import_identity,source_identity,workbook,sheet,source_row,kind,
             proposed_resource_type,proposed_resource_id,status,review_flags,raw_data,mapped_data,
             resolution,notes,version,created_by,updated_by,created_at,updated_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb,
                   '{}'::jsonb,null,1,$15,$15,now(),now())
           on conflict (organization_id,source_identity) do update set
             import_identity=excluded.import_identity,workbook=excluded.workbook,sheet=excluded.sheet,
             source_row=excluded.source_row,kind=excluded.kind,
             proposed_resource_type=excluded.proposed_resource_type,
             proposed_resource_id=excluded.proposed_resource_id,
             status=case
               when workbook_import_review_rows.resolution='{}'::jsonb
                 and workbook_import_review_rows.notes is null
               then excluded.status
               else workbook_import_review_rows.status
             end,
             review_flags=excluded.review_flags,raw_data=excluded.raw_data,
             mapped_data=case
               when workbook_import_review_rows.resolution='{}'::jsonb
                 and workbook_import_review_rows.notes is null
               then excluded.mapped_data
               else workbook_import_review_rows.mapped_data
             end,
             version=workbook_import_review_rows.version+1,updated_by=excluded.updated_by,updated_at=now()
           where (workbook_import_review_rows.import_identity,workbook_import_review_rows.workbook,
                  workbook_import_review_rows.sheet,workbook_import_review_rows.source_row,
                  workbook_import_review_rows.kind,workbook_import_review_rows.proposed_resource_type,
                  workbook_import_review_rows.proposed_resource_id,
                  workbook_import_review_rows.review_flags,workbook_import_review_rows.raw_data)
             is distinct from
                 (excluded.import_identity,excluded.workbook,excluded.sheet,excluded.source_row,
                  excluded.kind,excluded.proposed_resource_type,excluded.proposed_resource_id,
                  excluded.review_flags,excluded.raw_data)
              or (
                workbook_import_review_rows.resolution='{}'::jsonb
                and workbook_import_review_rows.notes is null
                and (workbook_import_review_rows.status,workbook_import_review_rows.mapped_data)
                    is distinct from (excluded.status,excluded.mapped_data)
              )`,
          [
            organizationId,
            row.id,
            importIdentity,
            row.sourceIdentity,
            row.workbook,
            row.sheet,
            row.row,
            row.kind,
            row.proposedResourceType,
            row.proposedResourceId ?? null,
            row.status,
            JSON.stringify(row.reviewFlags),
            JSON.stringify(row.rawData),
            JSON.stringify(row.mappedData),
            actorId,
          ],
        );
      }

      // 2.1 Parties
      for (const party of payload.parties) {
        const pResult = await client.query(
          `insert into parties (organization_id, id, display_name, status, created_at, updated_at)
           values ($1, $2, $3, $4, now(), now())
           on conflict (organization_id, id) do nothing`,
          [organizationId, party.id, party.displayName, party.status],
        );
        if (pResult.rowCount && pResult.rowCount > 0) {
          partiesCreated++;
        }
        for (const role of party.roles) {
          await client.query(
            `insert into party_roles (organization_id, party_id, role, created_at)
             values ($1, $2, $3, now())
             on conflict (organization_id, party_id, role) do nothing`,
            [organizationId, party.id, role],
          );
        }
      }

      // 2.2 Projects
      for (const project of payload.projects) {
        const prjResult = await client.query(
          `insert into projects (organization_id, id, code, name, client_party_id, owner_user_id, contract_type, currency, budget_minor, starts_on, ends_on, state, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), now())
           on conflict (organization_id, id) do nothing`,
          [
            organizationId,
            project.id,
            project.code,
            project.name,
            project.clientPartyId,
            actorId,
            project.contractType,
            project.currency,
            project.budgetMinor,
            project.startsOn,
            project.endsOn,
            project.state,
          ],
        );
        if (prjResult.rowCount && prjResult.rowCount > 0) {
          projectsCreated++;
        }
      }

      // 2.3 Sales Invoices
      for (const invoice of payload.salesInvoices) {
        const journalId = `journal-sales-import-${invoice.id}`;
        const existingDocument = await client.query(
          `select 1 from commercial_documents where organization_id=$1 and id=$2`,
          [organizationId, invoice.id],
        );
        if (existingDocument.rowCount) continue;
        await client.query(
          `insert into journal_entries (organization_id, id, journal_date, description, currency, state, version, created_by, approved_at, approved_by, approval_reason, self_approved, posted_at, posted_by)
           values ($1, $2, $3, $4, $5, 'posted', 1, $6, now(), $6, 'Controlled workbook migration', true, now(), $6)`,
          [
            organizationId,
            journalId,
            invoice.documentDate,
            `Sales Invoice ${invoice.documentNumber}`,
            invoice.currency,
            actorId,
          ],
        );
        // Insert commercial document
        const docResult = await client.query(
          `insert into commercial_documents (organization_id, id, type, state, document_number, series, fiscal_year, party_id, document_date, due_date, currency, net_minor, tax_minor, gross_minor, control_account_code, journal_id, created_by, issued_or_posted_by, issued_or_posted_at, created_at, updated_at)
           values ($1, $2, 'sales_invoice', 'posted', $3, 'WB', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14, now(), now(), now())
           on conflict (organization_id, id) do nothing`,
          [
            organizationId,
            invoice.id,
            invoice.documentNumber,
            Number(invoice.documentDate.substring(0, 4)),
            invoice.partyId,
            invoice.documentDate,
            invoice.dueDate,
            invoice.currency,
            invoice.netMinor,
            invoice.taxMinor,
            invoice.grossMinor,
            invoice.controlAccountCode,
            journalId,
            actorId,
          ],
        );

        if (docResult.rowCount && docResult.rowCount > 0) {
          salesInvoicesCreated++;

          // Insert document line
          await client.query(
            `insert into commercial_document_lines (organization_id, document_id, line_number, description, quantity, unit_price_minor, net_minor, tax_minor, gross_minor, primary_account_code, tax_account_code, dimensions, created_at)
             values ($1, $2, 1, $3, 1, $4, $4, $5, $6, '511', case when $5::bigint > 0 then '3331' else null end, $7, now())`,
            [
              organizationId,
              invoice.id,
              `Sales invoice ${invoice.documentNumber}`,
              invoice.netMinor,
              invoice.taxMinor,
              invoice.grossMinor,
              JSON.stringify({ projectId: invoice.projectId ?? null }),
            ],
          );

          // DR Accounts Receivable 131
          await client.query(
            `insert into journal_lines (organization_id, journal_id, line_number, account_code, debit_minor, credit_minor, description, dimensions)
             values ($1, $2, 1, $3, $4, null, $5, $6)`,
            [
              organizationId,
              journalId,
              invoice.controlAccountCode,
              invoice.grossMinor,
              `Phải thu - ${invoice.documentNumber}`,
              JSON.stringify({
                partyId: invoice.partyId,
                projectId: invoice.projectId || null,
              }),
            ],
          );

          // CR Service Revenue 511
          await client.query(
            `insert into journal_lines (organization_id, journal_id, line_number, account_code, debit_minor, credit_minor, description, dimensions)
             values ($1, $2, 2, '511', null, $3, $4, $5)`,
            [
              organizationId,
              journalId,
              invoice.netMinor,
              `Doanh thu - ${invoice.documentNumber}`,
              JSON.stringify({
                category: "SALES_SERVICE",
                projectId: invoice.projectId || null,
              }),
            ],
          );

          // CR VAT Output 3331 (if tax > 0)
          if (BigInt(invoice.taxMinor) > 0n) {
            await client.query(
              `insert into journal_lines (organization_id, journal_id, line_number, account_code, debit_minor, credit_minor, description, dimensions)
               values ($1, $2, 3, '3331', null, $3, $4, $5)`,
              [
                organizationId,
                journalId,
                invoice.taxMinor,
                `Thuế VAT - ${invoice.documentNumber}`,
                JSON.stringify({
                  projectId: invoice.projectId || null,
                }),
              ],
            );
          }

          // Link to external references
          await client.query(
            `insert into external_references (organization_id, system, external_id, document_id, synced_at, metadata, created_at, updated_at)
             values ($1, 'lark', $2, $3, now(), $4, now(), now())
             on conflict (organization_id, system, external_id) do nothing`,
            [
              organizationId,
              invoice.sourceIdentity,
              invoice.id,
              JSON.stringify({ source: "workbook_import", row: invoice.sourceRowIndex }),
            ],
          );
        }
      }

      // 2.4 Expenses
      for (const exp of payload.expenses) {
        const journalId = `journal-expense-import-${exp.id}`;
        const grossMinor = exp.amountMinor;
        const taxMinor = exp.taxMinor;
        const netMinor = (BigInt(grossMinor) - BigInt(taxMinor)).toString();
        if (BigInt(grossMinor) === 0n && BigInt(taxMinor) === 0n) {
          expensesSkipped += 1;
          continue;
        }
        const existingExpense = await client.query(
          `select 1 from expenses where organization_id=$1 and id=$2`,
          [organizationId, exp.id],
        );
        if (existingExpense.rowCount) continue;
        await client.query(
          `insert into journal_entries (organization_id, id, journal_date, description, currency, state, version, created_by, approved_at, approved_by, approval_reason, self_approved, posted_at, posted_by)
           values ($1, $2, $3, $4, $5, 'posted', 1, $6, now(), $6, 'Controlled workbook migration', true, now(), $6)`,
          [
            organizationId,
            journalId,
            exp.date,
            `Chi phí - ${exp.businessPurpose}`,
            exp.currency,
            actorId,
          ],
        );

        const expResult = await client.query(
          `insert into expenses (organization_id, id, expense_class, payee_party_id, expense_date, business_purpose, currency, net_minor, vat_minor, gross_minor, counter_account_code, state, journal_id, created_by, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '111', 'posted', $11, $12, now(), now())
           on conflict (organization_id, id) do nothing`,
          [
            organizationId,
            exp.id,
            exp.class,
            exp.payeePartyId,
            exp.date,
            exp.businessPurpose,
            exp.currency,
            netMinor,
            taxMinor,
            grossMinor,
            journalId,
            actorId,
          ],
        );

        if (expResult.rowCount && expResult.rowCount > 0) {
          expensesCreated++;

          // Insert expense line
          await client.query(
            `insert into expense_lines (organization_id, expense_id, line_number, description, net_minor, vat_minor, gross_minor, posting_account_code, vat_account_code, created_at)
             values ($1, $2, 1, $3, $4, $5, $6, '642', case when $5::bigint > 0 then '1331' else null end, now())`,
            [organizationId, exp.id, exp.businessPurpose, netMinor, taxMinor, grossMinor],
          );

          // DR Expense Account 642 (or 632 if project-linked)
          const expenseAccount = exp.projectId ? "632" : "642";
          await client.query(
            `insert into journal_lines (organization_id, journal_id, line_number, account_code, debit_minor, credit_minor, description, dimensions)
             values ($1, $2, 1, $3, $4, null, $5, $6)`,
            [
              organizationId,
              journalId,
              expenseAccount,
              netMinor,
              exp.businessPurpose,
              JSON.stringify({
                category: "EXPENSE_NON_DOCUMENTED",
                costCenter: "GENERAL",
                serviceLine: "WEB_APP",
                projectId: exp.projectId || null,
              }),
            ],
          );

          // DR VAT Input 1331 (if tax > 0)
          if (BigInt(taxMinor) > 0n) {
            await client.query(
              `insert into journal_lines (organization_id, journal_id, line_number, account_code, debit_minor, credit_minor, description, dimensions)
               values ($1, $2, 2, '1331', $3, null, $4, $5)`,
              [
                organizationId,
                journalId,
                taxMinor,
                `Thuế VAT đầu vào`,
                JSON.stringify({
                  projectId: exp.projectId || null,
                }),
              ],
            );
          }

          // CR Cash/Bank 111
          const lineNum = BigInt(taxMinor) > 0n ? 3 : 2;
          await client.query(
            `insert into journal_lines (organization_id, journal_id, line_number, account_code, debit_minor, credit_minor, description, dimensions)
             values ($1, $2, $3, '111', null, $4, $5, $6)`,
            [
              organizationId,
              journalId,
              lineNum,
              grossMinor,
              `Chi tiền mặt/ngân hàng`,
              JSON.stringify({
                projectId: exp.projectId || null,
              }),
            ],
          );

          // Link to external references
          await client.query(
            `insert into external_references (organization_id, system, external_id, expense_id, synced_at, metadata, created_at, updated_at)
             values ($1, 'lark', $2, $3, now(), $4, now(), now())
             on conflict (organization_id, system, external_id) do nothing`,
            [
              organizationId,
              exp.sourceIdentity,
              exp.id,
              JSON.stringify({ source: "workbook_import", row: exp.sourceRowIndex }),
            ],
          );
        }
      }

      // 2.5 Audit log mutation record
      const existingAudit = await client.query<{ id: string }>(
        `select id from resource_audit_events where organization_id=$1 and resource_type='workbook_import' and resource_key=$2 and action='commit' limit 1`,
        [organizationId, importIdentity],
      );
      if (existingAudit.rows[0]) {
        auditEventId = existingAudit.rows[0].id;
      } else {
        await client.query(
          `insert into resource_audit_events (organization_id, id, resource_type, resource_key, resource_version, action, actor_id, correlation_id)
         values ($1, $2, 'workbook_import', $3, '1', 'commit', $4, $5)`,
          [organizationId, auditEventId, importIdentity, actorId, correlationId],
        );
      }

      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }

    return {
      valid: true,
      errors: [],
      issues: dryRunResult.issues,
      reconciliation: dryRunResult.reconciliation,
      coverage: dryRunResult.coverage,
      details: {
        partiesCreated,
        projectsCreated,
        salesInvoicesCreated,
        expensesCreated,
        expensesSkipped,
        auditEventId,
      },
    };
  }
}
