import {
  evaluatePaymentDeductibility,
  isPaymentMethod,
  isTransactionEvidence,
  type PaymentMethod,
  type TransactionEvidence,
} from "@naai-erp/domain";
import type { PoolClient } from "pg";
import {
  lookupReconciledBankPayment,
  querySameDaySupplierGrossMinor,
  resolveNonCashThresholdMinor,
  resolveOwnerCurrentAccountCodes,
  type SameDayActiveSource,
} from "./payment-evidence-queries.js";

export {
  lookupReconciledBankPayment,
  querySameDaySupplierGrossMinor,
  resolveNonCashThresholdMinor,
  resolveOwnerCurrentAccountCodes,
} from "./payment-evidence-queries.js";

function asPaymentMethod(value: string | null | undefined): PaymentMethod {
  return isPaymentMethod(value) ? value : "unpaid";
}

function asTransactionEvidence(value: string | null | undefined): TransactionEvidence {
  return isTransactionEvidence(value) ? value : "none";
}

export async function applySolopreneurExpenseDefaults(
  client: PoolClient,
  context: { organizationId: string; actorId: string },
  expenseId: string,
  reason = "Solopreneur default on approval",
  reevaluateSiblings = true,
  extraActiveSources: ReadonlyArray<SameDayActiveSource> = [],
): Promise<void> {
  const headerRes = await client.query<{
    id: string;
    expense_class: string;
    payee_party_id: string | null;
    expense_date: string;
    gross_minor: string;
    counter_account_code: string;
    funding_financial_account_id: string | null;
    payment_method: string;
    paid_on: string | null;
    payment_evidence_ref: string | null;
    transaction_evidence: string;
  }>(
    `select id, expense_class::text, payee_party_id, expense_date::text, gross_minor::text,
            counter_account_code, funding_financial_account_id,
            payment_method, paid_on::text, payment_evidence_ref, transaction_evidence
       from expenses
      where organization_id = $1 and id = $2
      for update`,
    [context.organizationId, expenseId],
  );
  const header = headerRes.rows[0];
  if (!header) return;

  const linesRes = await client.query<{
    line_number: number;
    management_state: string;
    cit_state: string;
    vat_state: string;
    net_minor: string;
    vat_minor: string;
    vat_account_code: string | null;
    funding_treatment: string | null;
    review_reference: string | null;
    root_type: string | null;
  }>(
    `select l.line_number, l.management_state::text, l.cit_state::text, l.vat_state::text,
            l.net_minor::text, l.vat_minor::text, l.vat_account_code,
            l.funding_treatment::text, l.review_reference, a.root_type::text
       from expense_lines l
       left join accounts a
         on a.organization_id = l.organization_id and a.code = l.posting_account_code
      where l.organization_id = $1 and l.expense_id = $2
      order by l.line_number
      for update of l`,
    [context.organizationId, expenseId],
  );
  if (!linesRes.rows.length) return;

  const excluded = [
    "non_documented",
    "owner_personal",
    "petty_cash",
    "prepaid",
    "prepaid_asset",
    "fixed_asset",
  ].includes(header.expense_class);
  const invalid = ["non_documented", "owner_personal", "petty_cash"].includes(header.expense_class);

  const thresholdMinor = await resolveNonCashThresholdMinor(client, context.organizationId);
  const ownerCodes = await resolveOwnerCurrentAccountCodes(
    client,
    context.organizationId,
    header.expense_date,
  );
  const reconciled = await lookupReconciledBankPayment(
    client,
    context.organizationId,
    "expense",
    expenseId,
  );
  const currentSource: SameDayActiveSource = { sourceType: "expense", sourceId: expenseId };
  const sameDayGross = await querySameDaySupplierGrossMinor(
    client,
    context.organizationId,
    header.payee_party_id,
    header.expense_date,
    [currentSource, ...extraActiveSources],
  );

  const isOwnerPaid =
    !header.funding_financial_account_id &&
    (ownerCodes.has(header.counter_account_code) ||
      linesRes.rows.some((l) => l.funding_treatment === "owner_paid_company_cost"));
  const reconciledPaidOn =
    reconciled.paidMinor >= BigInt(header.gross_minor) ? reconciled.paidOn : null;

  await client.query("select set_config('app.tax_finalization', 'on', true)");
  let anyLineMissing = false;

  for (const line of linesRes.rows) {
    const hasInputVat = !excluded && line.vat_account_code !== null && BigInt(line.vat_minor) > 0n;
    const decision = evaluatePaymentDeductibility({
      grossMinor: BigInt(header.gross_minor),
      hasInputVat,
      thresholdMinor,
      recordDate: header.expense_date,
      paymentMethod: asPaymentMethod(header.payment_method),
      paidOn: header.paid_on,
      paymentEvidenceRef: header.payment_evidence_ref,
      transactionEvidence: asTransactionEvidence(header.transaction_evidence),
      isOwnerPaid,
      reconciledBankPaidOn: reconciledPaidOn,
      sameDaySupplierGrossMinor: sameDayGross,
    });

    const canManageCit =
      line.cit_state === "unreviewed" || line.review_reference === "solopreneur_policy";
    const canManageVat =
      line.vat_state === "unreviewed" || line.review_reference === "solopreneur_policy";
    const canManageMgmt =
      line.management_state === "unreviewed" || line.review_reference === "solopreneur_policy";

    const nextMgmt = canManageMgmt ? (invalid ? "invalid" : "valid") : line.management_state;
    const citEligibleBase = !excluded && line.root_type !== "asset";
    const nextCit = canManageCit
      ? !citEligibleBase
        ? "ineligible"
        : decision.citGatedByPayment
          ? "unreviewed"
          : "eligible"
      : line.cit_state;
    const nextCitMinor = nextCit === "eligible" ? line.net_minor : "0";

    const nextVat = canManageVat
      ? !hasInputVat
        ? "ineligible"
        : decision.vatGatedByPayment
          ? "unreviewed"
          : "eligible"
      : line.vat_state;
    const nextVatMinor = nextVat === "eligible" ? line.vat_minor : "0";

    const lineMissing =
      !excluded &&
      ((nextCit === "unreviewed" && decision.citGatedByPayment) ||
        (nextVat === "unreviewed" && decision.vatGatedByPayment));
    if (lineMissing) anyLineMissing = true;

    await client.query(
      `update expense_lines set
         management_state = $4::management_validity_state,
         cit_state = case when $5::boolean then $6::eligibility_state else cit_state end,
         cit_eligible_minor = case when $5::boolean then $7::bigint else cit_eligible_minor end,
         vat_state = case when $8::boolean then $9::eligibility_state else vat_state end,
         vat_eligible_minor = case when $8::boolean then $10::bigint else vat_eligible_minor end,
         payment_evidence_missing = $11,
         reviewed_by = $12,
         reviewed_at = now(),
         review_reason = $13,
         review_reference = case
           when review_reference is null or review_reference = 'solopreneur_policy' then 'solopreneur_policy'
           else review_reference
         end
       where organization_id = $1 and expense_id = $2 and line_number = $3`,
      [
        context.organizationId,
        expenseId,
        line.line_number,
        nextMgmt,
        canManageCit,
        nextCit,
        nextCitMinor,
        canManageVat,
        nextVat,
        nextVatMinor,
        lineMissing,
        context.actorId,
        reason,
      ],
    );
  }

  await client.query(
    `update expenses set
       payment_evidence_missing = $3,
       cit_state = (
         select case
           when bool_or(cit_state = 'unreviewed') then 'unreviewed'::eligibility_state
           when bool_or(cit_state = 'accountant_override') then 'accountant_override'::eligibility_state
           when bool_or(cit_state = 'partially_eligible') or (bool_or(cit_state = 'eligible') and bool_or(cit_state = 'ineligible')) then 'partially_eligible'::eligibility_state
           when bool_and(cit_state = 'eligible') then 'eligible'::eligibility_state
           else 'ineligible'::eligibility_state
         end from expense_lines where organization_id = $1 and expense_id = $2
       ),
       vat_state = (
         select case
           when bool_or(vat_state = 'unreviewed') then 'unreviewed'::eligibility_state
           when bool_or(vat_state = 'accountant_override') then 'accountant_override'::eligibility_state
           when bool_or(vat_state = 'partially_eligible') or (bool_or(vat_state = 'eligible') and bool_or(vat_state = 'ineligible')) then 'partially_eligible'::eligibility_state
           when bool_and(vat_state = 'eligible') then 'eligible'::eligibility_state
           else 'ineligible'::eligibility_state
         end from expense_lines where organization_id = $1 and expense_id = $2
       )
     where organization_id = $1 and id = $2`,
    [context.organizationId, expenseId, anyLineMissing],
  );

  if (reevaluateSiblings && header.payee_party_id) {
    await reevaluateSameDaySiblings(
      client,
      context,
      header.payee_party_id,
      header.expense_date,
      currentSource,
    );
  }
}

export async function applySolopreneurPurchaseDocumentDefaults(
  client: PoolClient,
  context: { organizationId: string; actorId: string },
  documentId: string,
  reason = "Solopreneur default on approval",
  reevaluateSiblings = true,
  extraActiveSources: ReadonlyArray<SameDayActiveSource> = [],
): Promise<void> {
  const docRes = await client.query<{
    id: string;
    type: string;
    party_id: string;
    document_date: string;
    gross_minor: string;
    control_account_code: string;
    funding_financial_account_id: string | null;
    payment_method: string;
    paid_on: string | null;
    payment_evidence_ref: string | null;
    transaction_evidence: string;
  }>(
    `select id, type::text, party_id, document_date::text, gross_minor::text,
            control_account_code, funding_financial_account_id,
            payment_method, paid_on::text, payment_evidence_ref, transaction_evidence
       from commercial_documents
      where organization_id = $1 and id = $2
      for update`,
    [context.organizationId, documentId],
  );
  const doc = docRes.rows[0];
  if (!doc || doc.type !== "purchase_invoice") return;

  const linesRes = await client.query<{
    line_number: number;
    management_state: string;
    cit_state: string;
    vat_state: string;
    net_minor: string;
    tax_minor: string;
    tax_account_code: string | null;
    review_reference: string | null;
    root_type: string | null;
  }>(
    `select l.line_number, l.management_state::text, l.cit_state::text, l.vat_state::text,
            l.net_minor::text, l.tax_minor::text, l.tax_account_code,
            l.review_reference, a.root_type::text
       from commercial_document_lines l
       left join accounts a
         on a.organization_id = l.organization_id and a.code = l.primary_account_code
      where l.organization_id = $1 and l.document_id = $2
      order by l.line_number
      for update of l`,
    [context.organizationId, documentId],
  );
  if (!linesRes.rows.length) return;

  const thresholdMinor = await resolveNonCashThresholdMinor(client, context.organizationId);
  const ownerCodes = await resolveOwnerCurrentAccountCodes(
    client,
    context.organizationId,
    doc.document_date,
  );
  const reconciled = await lookupReconciledBankPayment(
    client,
    context.organizationId,
    "commercial_document",
    documentId,
  );
  const currentSource: SameDayActiveSource = {
    sourceType: "purchase_invoice",
    sourceId: documentId,
  };
  const sameDayGross = await querySameDaySupplierGrossMinor(
    client,
    context.organizationId,
    doc.party_id,
    doc.document_date,
    [currentSource, ...extraActiveSources],
  );

  const isOwnerPaid = !doc.funding_financial_account_id && ownerCodes.has(doc.control_account_code);
  const reconciledPaidOn =
    reconciled.paidMinor >= BigInt(doc.gross_minor) ? reconciled.paidOn : null;

  await client.query("select set_config('app.tax_finalization', 'on', true)");
  let anyLineMissing = false;

  for (const line of linesRes.rows) {
    const hasInputVat = line.tax_account_code !== null && BigInt(line.tax_minor) > 0n;
    const decision = evaluatePaymentDeductibility({
      grossMinor: BigInt(doc.gross_minor),
      hasInputVat,
      thresholdMinor,
      recordDate: doc.document_date,
      paymentMethod: asPaymentMethod(doc.payment_method),
      paidOn: doc.paid_on,
      paymentEvidenceRef: doc.payment_evidence_ref,
      transactionEvidence: asTransactionEvidence(doc.transaction_evidence),
      isOwnerPaid,
      reconciledBankPaidOn: reconciledPaidOn,
      sameDaySupplierGrossMinor: sameDayGross,
    });

    const canManageCit =
      line.cit_state === "unreviewed" || line.review_reference === "solopreneur_policy";
    const canManageVat =
      line.vat_state === "unreviewed" ||
      line.review_reference === "solopreneur_policy" ||
      line.review_reference === null;
    const canManageMgmt =
      line.management_state === "unreviewed" ||
      line.review_reference === "solopreneur_policy" ||
      line.review_reference === null;

    const nextMgmt = canManageMgmt ? "valid" : line.management_state;
    const citEligibleBase = line.root_type !== "asset";
    const nextCit = canManageCit
      ? !citEligibleBase
        ? "ineligible"
        : decision.citGatedByPayment
          ? "unreviewed"
          : "eligible"
      : line.cit_state;
    const nextCitMinor = nextCit === "eligible" ? line.net_minor : "0";

    const nextVat = canManageVat
      ? !hasInputVat
        ? "ineligible"
        : decision.vatGatedByPayment
          ? "unreviewed"
          : "eligible"
      : line.vat_state;
    const nextVatMinor = nextVat === "eligible" ? line.tax_minor : "0";

    const lineMissing =
      (nextCit === "unreviewed" && decision.citGatedByPayment) ||
      (nextVat === "unreviewed" && decision.vatGatedByPayment);
    if (lineMissing) anyLineMissing = true;

    await client.query(
      `update commercial_document_lines set
         management_state = $4::management_validity_state,
         cit_state = case when $5::boolean then $6::eligibility_state else cit_state end,
         cit_eligible_minor = case when $5::boolean then $7::bigint else cit_eligible_minor end,
         vat_state = case when $8::boolean then $9::eligibility_state else vat_state end,
         vat_eligible_minor = case when $8::boolean then $10::bigint else vat_eligible_minor end,
         payment_evidence_missing = $11,
         reviewed_by = $12,
         reviewed_at = now(),
         review_reason = $13,
         review_reference = case
           when review_reference is null or review_reference = 'solopreneur_policy' then 'solopreneur_policy'
           else review_reference
         end
       where organization_id = $1 and document_id = $2 and line_number = $3`,
      [
        context.organizationId,
        documentId,
        line.line_number,
        nextMgmt,
        canManageCit,
        nextCit,
        nextCitMinor,
        canManageVat,
        nextVat,
        nextVatMinor,
        lineMissing,
        context.actorId,
        reason,
      ],
    );
  }

  await client.query(
    `update commercial_documents set payment_evidence_missing = $3
      where organization_id = $1 and id = $2`,
    [context.organizationId, documentId, anyLineMissing],
  );

  if (reevaluateSiblings && doc.party_id) {
    await reevaluateSameDaySiblings(
      client,
      context,
      doc.party_id,
      doc.document_date,
      currentSource,
    );
  }
}

async function reevaluateSameDaySiblings(
  client: PoolClient,
  context: { organizationId: string; actorId: string },
  partyId: string,
  date: string,
  triggerSource: SameDayActiveSource,
): Promise<void> {
  const docs = await client.query<{ id: string }>(
    `select id from commercial_documents
      where organization_id = $1 and type = 'purchase_invoice'
        and party_id = $2 and document_date = $3::date
        and state in ('approved', 'posted', 'partially_paid', 'paid') and id <> $4
      order by id`,
    [context.organizationId, partyId, date, triggerSource.sourceId],
  );
  for (const row of docs.rows) {
    await applySolopreneurPurchaseDocumentDefaults(
      client,
      context,
      row.id,
      "Re-evaluated same-day supplier VAT threshold",
      false,
      [triggerSource],
    );
  }
  const exps = await client.query<{ id: string }>(
    `select id from expenses
      where organization_id = $1 and payee_party_id = $2
        and expense_date = $3::date and state in ('approved', 'posted') and id <> $4
      order by id`,
    [context.organizationId, partyId, date, triggerSource.sourceId],
  );
  for (const row of exps.rows) {
    await applySolopreneurExpenseDefaults(
      client,
      context,
      row.id,
      "Re-evaluated same-day supplier VAT threshold",
      false,
      [triggerSource],
    );
  }
}

export { syncReconciledPaymentEvidence } from "./payment-evidence-reconciliation.sync.js";
