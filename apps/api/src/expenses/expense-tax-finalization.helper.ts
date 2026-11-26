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
} from "../payment-evidence/payment-evidence-queries.js";

export type TaxFinalizationItem = {
  sourceType: "expense" | "purchase_invoice";
  sourceId: string;
  lineNumber: number;
  priorManagementState: string;
  priorCitState: string;
  priorVatState: string;
  managementState: string;
  citState: string;
  citEligibleMinor: string;
  vatState: string;
  vatEligibleMinor: string;
  netMinor: string;
  vatMinor: string;
};

function asPaymentMethod(value: string | null | undefined): PaymentMethod {
  return isPaymentMethod(value) ? value : "unpaid";
}

function asTransactionEvidence(value: string | null | undefined): TransactionEvidence {
  return isTransactionEvidence(value) ? value : "none";
}

export async function buildTaxFinalizationPlan(
  c: PoolClient,
  organizationId: string,
): Promise<TaxFinalizationItem[]> {
  const thresholdMinor = await resolveNonCashThresholdMinor(c, organizationId);
  const rows = await c.query<{
    source_type: "expense" | "purchase_invoice";
    source_id: string;
    line_number: number;
    record_date: string;
    party_id: string | null;
    gross_minor: string;
    account_code: string;
    funding_financial_account_id: string | null;
    funding_treatment: string | null;
    payment_method: string;
    paid_on: string | null;
    payment_evidence_ref: string | null;
    transaction_evidence: string;
    management_state: string;
    cit_state: string;
    vat_state: string;
    net_minor: string;
    tax_minor: string;
    primary_account_code: string;
    vat_account_code: string | null;
    expense_class: string | null;
    journal_id: string;
    root_type: string | null;
    dimensions: Record<string, string> | null;
    allocation_tax: Record<string, string>[] | null;
  }>(
    `select 'expense'::text source_type, e.id source_id, l.line_number, e.expense_date::text record_date,
            e.payee_party_id party_id, e.gross_minor::text, e.counter_account_code account_code,
            e.funding_financial_account_id, l.funding_treatment::text,
            e.payment_method, e.paid_on::text, e.payment_evidence_ref, e.transaction_evidence,
            l.management_state::text, l.cit_state::text, l.vat_state::text,
            l.net_minor::text, l.vat_minor::text tax_minor, l.posting_account_code primary_account_code,
            l.vat_account_code, e.expense_class::text, e.journal_id, a.root_type::text, l.dimensions,
            null::jsonb allocation_tax
       from expenses e join expense_lines l on l.organization_id = e.organization_id and l.expense_id = e.id
       left join accounts a on a.organization_id = l.organization_id and a.code = l.posting_account_code
      where e.organization_id = $1 and e.state = 'posted'
        and (l.management_state = 'unreviewed' or l.cit_state = 'unreviewed' or l.vat_state = 'unreviewed')
     union all
     select 'purchase_invoice', d.id, l.line_number, d.document_date::text,
            d.party_id, d.gross_minor::text, d.control_account_code,
            d.funding_financial_account_id, null::text,
            d.payment_method, d.paid_on::text, d.payment_evidence_ref, d.transaction_evidence,
            l.management_state::text, l.cit_state::text, l.vat_state::text,
            l.net_minor::text, l.tax_minor::text, l.primary_account_code, l.tax_account_code, null, d.journal_id,
            a.root_type::text, l.dimensions,
            coalesce((select jsonb_agg(x.dimensions order by x.allocation_number)
                        from commercial_document_allocations x
                       where x.organization_id = l.organization_id and x.document_id = l.document_id
                         and x.line_number = l.line_number), '[]'::jsonb)
       from commercial_documents d join commercial_document_lines l
         on l.organization_id = d.organization_id and l.document_id = d.id
       left join accounts a on a.organization_id = l.organization_id and a.code = l.primary_account_code
      where d.organization_id = $1 and d.type = 'purchase_invoice' and d.state in ('posted', 'partially_paid', 'paid')
        and (l.management_state = 'unreviewed' or l.cit_state = 'unreviewed' or l.vat_state = 'unreviewed')
      order by source_type, source_id, line_number`,
    [organizationId],
  );

  const items: TaxFinalizationItem[] = [];
  for (const row of rows.rows) {
    const excludedClass =
      row.source_type === "expense" &&
      [
        "non_documented",
        "owner_personal",
        "petty_cash",
        "prepaid",
        "prepaid_asset",
        "fixed_asset",
      ].includes(row.expense_class ?? "");
    const ownerCodes = await resolveOwnerCurrentAccountCodes(c, organizationId, row.record_date);
    const reconciled = await lookupReconciledBankPayment(
      c,
      organizationId,
      row.source_type === "expense" ? "expense" : "commercial_document",
      row.source_id,
    );
    const sameDayGross = await querySameDaySupplierGrossMinor(
      c,
      organizationId,
      row.party_id,
      row.record_date,
      [{ sourceType: row.source_type, sourceId: row.source_id }],
    );
    const isOwnerPaid =
      !row.funding_financial_account_id &&
      (ownerCodes.has(row.account_code) || row.funding_treatment === "owner_paid_company_cost");
    const reconciledPaidOn =
      reconciled.paidMinor >= BigInt(row.gross_minor) ? reconciled.paidOn : null;
    const hasInputVat =
      !excludedClass && Boolean(row.vat_account_code) && BigInt(row.tax_minor) > 0n;
    const decision = evaluatePaymentDeductibility({
      grossMinor: BigInt(row.gross_minor),
      hasInputVat,
      thresholdMinor,
      paymentMethod: asPaymentMethod(row.payment_method),
      paidOn: row.paid_on,
      paymentEvidenceRef: row.payment_evidence_ref,
      transactionEvidence: asTransactionEvidence(row.transaction_evidence),
      isOwnerPaid,
      reconciledBankPaidOn: reconciledPaidOn,
      sameDaySupplierGrossMinor: sameDayGross,
    });

    const citEligibleBase = !excludedClass && row.root_type !== "asset";
    if (!excludedClass && (decision.citGatedByPayment || decision.vatGatedByPayment)) {
      continue;
    }

    const managementState =
      row.source_type === "expense" &&
      ["non_documented", "owner_personal", "petty_cash"].includes(row.expense_class ?? "")
        ? "invalid"
        : "valid";
    let explicitVatMinor = 0n;
    let explicitVatSeen = false;
    for (const dimensions of row.allocation_tax ?? []) {
      if (dimensions.taxState !== undefined && dimensions.taxState !== "unreviewed") {
        explicitVatSeen = true;
      }
      if (["eligible", "accountant_override"].includes(dimensions.taxState ?? ""))
        explicitVatMinor = BigInt(row.tax_minor);
      else if (dimensions.taxState === "partially_eligible")
        explicitVatMinor += BigInt(dimensions.vatEligibleMinor ?? "0");
    }
    const journalVat =
      row.vat_account_code && BigInt(row.tax_minor) > 0n
        ? await c.query<{ debit: string }>(
            `select coalesce(sum(debit_minor), 0)::text debit from journal_lines
              where organization_id = $1 and journal_id = $2 and account_code = $3`,
            [organizationId, row.journal_id, row.vat_account_code],
          )
        : { rows: [{ debit: "0" }] };
    const journalEligible = BigInt(journalVat.rows[0]?.debit ?? "0") >= BigInt(row.tax_minor);
    const vatEligibleMinor =
      row.source_type === "purchase_invoice" && explicitVatSeen
        ? explicitVatMinor > BigInt(row.tax_minor)
          ? BigInt(row.tax_minor)
          : explicitVatMinor
        : journalEligible || hasInputVat
          ? BigInt(row.tax_minor)
          : 0n;
    items.push({
      sourceType: row.source_type,
      sourceId: row.source_id,
      lineNumber: row.line_number,
      priorCitState: row.cit_state,
      priorVatState: row.vat_state,
      priorManagementState: row.management_state,
      managementState,
      citState: citEligibleBase ? "eligible" : "ineligible",
      citEligibleMinor: citEligibleBase ? row.net_minor : "0",
      vatState:
        vatEligibleMinor === 0n
          ? "ineligible"
          : vatEligibleMinor === BigInt(row.tax_minor)
            ? "eligible"
            : "partially_eligible",
      vatEligibleMinor: vatEligibleMinor.toString(),
      netMinor: row.net_minor,
      vatMinor: row.tax_minor,
    });
  }
  return items;
}
