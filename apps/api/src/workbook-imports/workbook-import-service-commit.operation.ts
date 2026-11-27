import { createHash, randomUUID } from "node:crypto";
import type { WorkbookImportPayload } from "./workbook-import.types.js";
import { type ImportOutcome } from "./workbook-import.service.shared.js";
import type { WorkbookImportService } from "./workbook-import.service.js";

export async function commitOperation(
  this: WorkbookImportService,
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
  const importIdentity = createHash("sha256").update(JSON.stringify(payload.sources)).digest("hex");
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
      const defaultServiceLineCode =
        project.defaultServiceLineCode?.trim() || project.default_service_line_code?.trim() || null;
      const prjResult = await client.query(
        `insert into projects (organization_id, id, code, name, client_party_id, owner_user_id, contract_type, currency, budget_minor, starts_on, ends_on, state, default_service_line_code, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), now())
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
          defaultServiceLineCode,
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
          `insert into expense_lines (organization_id, expense_id, line_number, description, net_minor, vat_minor, gross_minor, posting_account_code, vat_account_code, dimensions, created_at)
           values ($1, $2, 1, $3, $4, $5, $6, '642', case when $5::bigint > 0 then '1331' else null end, jsonb_build_object('category',$7::text), now())`,
          [
            organizationId,
            exp.id,
            exp.businessPurpose,
            netMinor,
            taxMinor,
            grossMinor,
            exp.categoryCode,
          ],
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
