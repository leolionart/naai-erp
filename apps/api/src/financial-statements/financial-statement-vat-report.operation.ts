import { summarizePaymentEvidenceGaps } from "../payment-evidence/tax-report-enrichment.js";
import { buildTaxExpenseReview, buildVatReconciliation } from "@naai-erp/domain";
import type { FinancialStatementContext, StatementQuery } from "./financial-statement.types.js";
import { type LedgerRow, jsonMoney, natural } from "./pg-financial-statement.store.shared.js";
import type { PgFinancialStatementStore } from "./pg-financial-statement.store.js";

export async function vatReportOperation(
  this: PgFinancialStatementStore,
  c: FinancialStatementContext,
  q: StatementQuery,
  ledgerRows: LedgerRow[],
  mapping: {
    id: string;
    version: number;
    report_policy: {
      maxLedgerDifferenceMinor: string;
      maxUnreviewedInputMinor: string;
      maxUnresolvedItemCount: number;
      maxMissingEvidenceCount: number;
    };
  },
) {
  const source = await this.pool.query(
    `select concat('document:',d.id,':',l.line_number) id,d.id source_id,l.line_number,
      case when d.type='credit_note' and original.type='purchase_invoice' then 'purchase_credit_note'
           when d.type='credit_note' then 'sales_credit_note' else d.type::text end source_type,
      case when d.type='sales_invoice' or (d.type='credit_note' and original.type='sales_invoice') then 'output' else 'input' end tax_kind,
      l.tax_minor::text tax_minor,case when d.type='credit_note' then 'reversal' else 'normal' end direction,
      case when d.type='purchase_invoice' or (d.type='credit_note' and original.type='purchase_invoice') then l.vat_state::text else null::text end review_state,
      case when d.type='purchase_invoice' or (d.type='credit_note' and original.type='purchase_invoice') then l.vat_eligible_minor::text else null::text end eligible_minor,
      l.reviewed_by reviewer_id,l.review_reason,l.review_reference review_reference_id,l.tax_code,
      exists(select 1 from tax_code_versions t where t.organization_id=d.organization_id and t.code=l.tax_code
        and t.kind = (case when d.type='sales_invoice' or (d.type='credit_note' and original.type='sales_invoice') then 'vat_output' else 'vat_input' end)::tax_kind
        and t.review_state='accountant_approved' and t.effective_from<=d.document_date and (t.effective_to is null or t.effective_to>=d.document_date)) tax_code_approved,
      d.journal_id is not null posted_to_ledger,d.journal_id,
      case when l.tax_minor>0 then array['source_document']::text[] else array[]::text[] end required_evidence_types,
      case when exists(select 1 from evidence_records r where r.organization_id=d.organization_id and r.subject_type='commercial_document' and r.subject_id=d.id)
        or exists(select 1 from external_references xr where xr.organization_id=d.organization_id and xr.document_id=d.id)
        then array['source_document']::text[] else array[]::text[] end present_evidence_types,
      l.payment_evidence_missing
     from commercial_documents d join commercial_document_lines l on l.organization_id=d.organization_id and l.document_id=d.id
     left join commercial_documents original on original.organization_id=d.organization_id and original.id=d.original_document_id
     where d.organization_id=$1 and d.state<>'cancelled' and d.document_date between $2::date and $3::date and d.created_at <= $4::timestamptz and l.tax_minor>0
     union all
     select concat('expense:',e.id,':',l.line_number),e.id,l.line_number,'expense','input',l.vat_minor::text,'normal',l.vat_state::text,l.vat_eligible_minor::text,
      l.reviewed_by,l.review_reason,l.review_reference,null::text,true,e.journal_id is not null,e.journal_id,
      array['source_document']::text[],case when exists(select 1 from evidence_records r where r.organization_id=e.organization_id and r.subject_type='expense' and r.subject_id=e.id) or exists(select 1 from external_references xr where xr.organization_id=e.organization_id and xr.expense_id=e.id) then array['source_document']::text[] else array[]::text[] end,
      l.payment_evidence_missing
     from expenses e join expense_lines l on l.organization_id=e.organization_id and l.expense_id=e.id
     where e.organization_id=$1 and e.state<>'reversed' and e.expense_class<>'owner_personal' and e.expense_date between $2::date and $3::date and e.created_at <= $4::timestamptz and l.vat_minor>0`,
    [c.organizationId, q.startsOn, q.endsOn, q.asOfInstant],
  );
  const items = source.rows.map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    lineNumber: Number(r.line_number),
    sourceType: r.source_type,
    taxKind: r.tax_kind,
    taxMinor: BigInt(r.tax_minor),
    direction: r.direction,
    ...(r.review_state ? { reviewState: r.review_state } : {}),
    ...(r.review_state && r.review_state !== "unreviewed"
      ? { eligibleMinor: BigInt(r.eligible_minor ?? "0") }
      : {}),
    ...(r.reviewer_id ? { reviewerId: r.reviewer_id } : {}),
    ...(r.review_reason ? { reviewReason: r.review_reason } : {}),
    ...(r.review_reference_id ? { reviewReferenceId: r.review_reference_id } : {}),
    ...(r.tax_code ? { taxCode: r.tax_code } : {}),
    taxCodeApproved: r.tax_code_approved,
    paymentEvidenceMissing: Boolean(r.payment_evidence_missing),
    postedToLedger: r.posted_to_ledger,
    ...(r.journal_id ? { journalId: r.journal_id } : {}),
    requiredEvidenceTypes: r.required_evidence_types,
    presentEvidenceTypes: r.present_evidence_types,
    sourceIds: {
      ...(r.source_type === "expense" ? { expenseId: r.source_id } : { documentId: r.source_id }),
      ...(r.journal_id ? { journalId: r.journal_id } : {}),
      lineId: r.id,
    },
    nextActions: [
      ...(r.payment_evidence_missing ? ["update-payment-evidence"] : []),
      ...(!r.tax_code_approved && r.source_type !== "expense" ? ["resolve-tax-code"] : []),
      ...(r.tax_kind === "input" && r.review_state === "unreviewed" ? ["review-vat"] : []),
      "view-source",
    ],
    exceptionCodes: [
      r.payment_evidence_missing ? "PAYMENT_EVIDENCE_MISSING" : null,
      !r.tax_code_approved && r.source_type !== "expense" ? "VAT_TAX_CODE_INVALID" : null,
      r.tax_kind === "input" && r.review_state === "unreviewed" ? "VAT_UNREVIEWED" : null,
    ].filter(Boolean),
  }));
  const outputLedger = ledgerRows
    .filter((r) => r.vat_treatment === "output")
    .reduce((s, r) => s + natural(r) * BigInt(r.sign ?? 1), 0n);
  const inputLedger = ledgerRows
    .filter((r) => ["input_eligible", "input_ineligible"].includes(r.vat_treatment ?? ""))
    .reduce((s, r) => s + natural(r) * BigInt(r.sign ?? 1), 0n);
  const summary = jsonMoney(
    buildVatReconciliation({
      organizationId: c.organizationId,
      currency: await this.currency(c.organizationId),
      startsOn: q.startsOn!,
      endsOn: q.endsOn,
      policy: {
        id: mapping.id,
        version: mapping.version,
        maxLedgerDifferenceMinor: BigInt(mapping.report_policy.maxLedgerDifferenceMinor),
        maxUnreviewedInputMinor: BigInt(mapping.report_policy.maxUnreviewedInputMinor),
        maxUnresolvedItemCount: mapping.report_policy.maxUnresolvedItemCount,
        maxMissingEvidenceCount: mapping.report_policy.maxMissingEvidenceCount,
      },
      outputVatLedgerMinor: outputLedger,
      inputVatLedgerMinor: inputLedger,
      items,
    }),
  );
  const paymentGaps = await summarizePaymentEvidenceGaps(
    this.pool,
    c.organizationId,
    q.startsOn!,
    q.endsOn,
  );
  return {
    ...(summary as Record<string, unknown>),
    paymentEvidenceGaps: paymentGaps.summary,
    // Keep the source rows alongside the aggregate so every VAT KPI/source
    // drill-down can hand the user a concrete correction action.
    items: jsonMoney(items),
  };
}

export async function expenseExceptionsOperation(
  this: PgFinancialStatementStore,
  c: FinancialStatementContext,
  q: StatementQuery,
  state = "all",
) {
  const result = await this.pool.query(
    `select 'expense'::text source_type,e.id expense_id,e.expense_date::text,e.expense_class::text,e.state::text expense_state,e.currency,e.payee_party_id,e.journal_id,
      l.line_number,l.description,l.net_minor::text booked_net_minor,l.vat_minor::text booked_vat_minor,l.gross_minor::text booked_gross_minor,
      l.cit_eligible_minor::text,l.vat_eligible_minor::text,l.management_state::text,l.cit_state::text,l.vat_state::text,
      l.reviewed_by,l.reviewed_at,l.review_reason,l.review_reference,l.posting_account_code,l.vat_account_code,null::text tax_code,l.dimensions,
      true tax_code_approved,
      (l.review_reference in ('solopreneur_policy','owner_final','owner_final_legacy')
        or exists(select 1 from evidence_records r where r.organization_id=e.organization_id and r.subject_type='expense' and r.subject_id=e.id)
        or exists(select 1 from external_references xr where xr.organization_id=e.organization_id and xr.expense_id=e.id)) source_evidence_present,
      e.payment_method,e.paid_on::text,e.payment_evidence_ref,e.transaction_evidence,l.payment_evidence_missing
     from expenses e join expense_lines l on l.organization_id=e.organization_id and l.expense_id=e.id
     join journal_entries j on j.organization_id=e.organization_id and j.id=e.journal_id
     where e.organization_id=$1 and e.state='posted' and e.expense_class<>'owner_personal'
       and e.expense_date between $2::date and $3::date and e.created_at <= $4::timestamptz
       and j.state in ('posted','reversed') and j.posted_at <= $4::timestamptz
     union all
     select 'purchase_invoice'::text,d.id,d.document_date::text,'invoice_backed',d.state::text,d.currency,d.party_id,d.journal_id,
      l.line_number,l.description,l.net_minor::text,l.tax_minor::text,l.gross_minor::text,
      l.cit_eligible_minor::text,l.vat_eligible_minor::text,l.management_state::text,l.cit_state::text,l.vat_state::text,
      l.reviewed_by,l.reviewed_at,l.review_reason,l.review_reference,l.primary_account_code,l.tax_account_code,l.tax_code,l.dimensions,
      exists(select 1 from tax_code_versions t where t.organization_id=d.organization_id and t.code=l.tax_code and t.kind='vat_input' and t.review_state='accountant_approved' and t.effective_from<=d.document_date and (t.effective_to is null or t.effective_to>=d.document_date)) tax_code_approved,
      (l.review_reference in ('solopreneur_policy','owner_final','owner_final_legacy')
        or exists(select 1 from evidence_records r where r.organization_id=d.organization_id and r.subject_type='commercial_document' and r.subject_id=d.id)
        or exists(select 1 from external_references xr where xr.organization_id=d.organization_id and xr.document_id=d.id)) source_evidence_present,
      d.payment_method,d.paid_on::text,d.payment_evidence_ref,d.transaction_evidence,l.payment_evidence_missing
     from commercial_documents d
     join commercial_document_lines l on l.organization_id=d.organization_id and l.document_id=d.id
     join journal_entries j on j.organization_id=d.organization_id and j.id=d.journal_id
     where d.organization_id=$1 and d.type='purchase_invoice'
       and d.state in ('posted','partially_paid','paid')
       and d.document_date between $2::date and $3::date and d.created_at <= $4::timestamptz
       and j.state in ('posted','reversed') and j.posted_at <= $4::timestamptz
     order by expense_date,expense_id,line_number`,
    [c.organizationId, q.startsOn, q.endsOn, q.asOfInstant],
  );
  // Keep the report population and the summary in lockstep with the caller's
  // state filter.  Previously the service validated `state` but the store
  // ignored it, so every posted line was returned for every filter (including
  // already reviewed lines).  An exception is a line that still needs a tax /
  // management decision or has no source evidence; a reviewed line has none
  // of those conditions.
  const filteredRows = result.rows.filter((row) => {
    const invalidTaxCode =
      row.source_type === "purchase_invoice" &&
      BigInt(row.booked_vat_minor ?? "0") > 0n &&
      !row.tax_code_approved;
    const unresolved =
      row.management_state === "unreviewed" ||
      row.cit_state === "unreviewed" ||
      row.vat_state === "unreviewed" ||
      invalidTaxCode ||
      !row.source_evidence_present;
    if (state === "all") return true;
    if (state === "unreviewed")
      return (
        row.management_state === "unreviewed" ||
        row.cit_state === "unreviewed" ||
        row.vat_state === "unreviewed" ||
        invalidTaxCode
      );
    if (state === "exception") return unresolved;
    if (state === "reviewed") return !unresolved;
    return true;
  });
  const items = filteredRows.map((row) => {
    const invalidTaxCode =
      row.source_type === "purchase_invoice" &&
      BigInt(row.booked_vat_minor ?? "0") > 0n &&
      !row.tax_code_approved;
    return {
      ...row,
      sourceType: row.source_type,
      sourceIds: {
        expenseId: row.expense_id,
        ...(row.source_type === "purchase_invoice" ? { documentId: row.expense_id } : {}),
        journalId: row.journal_id,
        lineId: `${row.expense_id}:${row.line_number}`,
      },
      ...(row.tax_code ? { taxCode: row.tax_code } : {}),
      taxCodeApproved: Boolean(row.tax_code_approved),
      paymentMethod: row.payment_method,
      paidOn: row.paid_on,
      paymentEvidenceRef: row.payment_evidence_ref,
      transactionEvidence: row.transaction_evidence,
      paymentEvidenceMissing: Boolean(row.payment_evidence_missing),
      nextActions: [
        ...(row.payment_evidence_missing ? ["update-payment-evidence" as const] : []),
        ...(row.cit_state === "unreviewed" ? ["review-cit" as const] : []),
        ...(row.vat_state === "unreviewed" ? ["review-vat" as const] : []),
        ...(invalidTaxCode ? ["resolve-tax-code" as const] : []),
        "view-source" as const,
      ],
      exceptionCodes: [
        row.payment_evidence_missing ? "PAYMENT_EVIDENCE_MISSING" : null,
        row.cit_state === "unreviewed" ? "CIT_UNREVIEWED" : null,
        row.vat_state === "unreviewed" ? "VAT_UNREVIEWED" : null,
        invalidTaxCode ? "VAT_TAX_CODE_INVALID" : null,
      ].filter(Boolean),
    };
  });
  const reviewItems = items.map((row) => ({
    id: `${row.expense_id}:${row.line_number}`,
    sourceId: row.expense_id,
    accountingBookedMinor: BigInt(row.booked_net_minor),
    citBasisMinor: BigInt(row.booked_net_minor),
    citReviewState: row.cit_state,
    ...(row.cit_state !== "unreviewed" ? { citEligibleMinor: BigInt(row.cit_eligible_minor) } : {}),
    vatBasisMinor: BigInt(row.booked_vat_minor),
    vatReviewState: row.vat_state,
    ...(row.vat_state !== "unreviewed" ? { vatEligibleMinor: BigInt(row.vat_eligible_minor) } : {}),
    ...(row.reviewed_by ? { reviewerId: row.reviewed_by } : {}),
    ...(row.review_reason ? { reviewReason: row.review_reason } : {}),
    ...(row.review_reference ? { reviewReferenceId: row.review_reference } : {}),
    requiredEvidenceTypes: ["source_document"],
    presentEvidenceTypes: row.source_evidence_present ? ["source_document"] : [],
  }));
  const summary = buildTaxExpenseReview({
    organizationId: c.organizationId,
    currency: await this.currency(c.organizationId),
    startsOn: q.startsOn!,
    endsOn: q.endsOn,
    items: reviewItems,
  });
  const paymentGaps = await summarizePaymentEvidenceGaps(
    this.pool,
    c.organizationId,
    q.startsOn!,
    q.endsOn,
  );
  return {
    ...(jsonMoney(summary) as Record<string, unknown>),
    paymentEvidenceGaps: paymentGaps.summary,
    status: items.some(
      (row) =>
        row.management_state === "unreviewed" ||
        row.cit_state === "unreviewed" ||
        row.vat_state === "unreviewed" ||
        (row.source_type === "purchase_invoice" &&
          BigInt(row.booked_vat_minor ?? "0") > 0n &&
          !row.tax_code_approved) ||
        !row.source_evidence_present,
    )
      ? "review_required"
      : summary.status,
    asOfInstant: q.asOfInstant,
    items,
    count: items.length,
  };
}
