import { PAYMENT_EVIDENCE_CONTRACT_VERSION } from "@naai-erp/contracts";
import {
  computeSameDaySupplierTotals,
  evaluatePaymentDeductibility,
  isPaymentMethod,
  isTransactionEvidence,
  type PaymentMethod,
  type SameDaySupplierInvoiceSlice,
  type TransactionEvidence,
} from "@naai-erp/domain";
import {
  lookupReconciledBankPayment,
  resolveNonCashThresholdMinor,
  resolveOwnerCurrentAccountCodes,
  type Queryable,
} from "./payment-evidence-queries.js";
import type {
  PaymentEvidenceGapItem,
  PaymentEvidenceGapsReport,
} from "./payment-evidence.types.js";

function asPaymentMethod(value: string | null | undefined): PaymentMethod {
  return isPaymentMethod(value) ? value : "unpaid";
}

function asTransactionEvidence(value: string | null | undefined): TransactionEvidence {
  return isTransactionEvidence(value) ? value : "none";
}

export async function queryPaymentEvidenceGapsReport(
  pool: Queryable,
  organizationId: string,
  query: { startsOn: string; endsOn: string },
): Promise<PaymentEvidenceGapsReport> {
  const orgRes = await pool.query<{ base_currency: string }>(
    `select base_currency from organizations where id = $1`,
    [organizationId],
  );
  if (!orgRes.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
  const baseCurrency = orgRes.rows[0].base_currency;
  const [thresholdMinor, ownerCodes] = await Promise.all([
    resolveNonCashThresholdMinor(pool, organizationId),
    resolveOwnerCurrentAccountCodes(pool, organizationId, query.endsOn),
  ]);

  const sourceRows = await pool.query<{
    source_type: "expense" | "purchase_invoice";
    source_id: string;
    line_number: number;
    record_date: string;
    party_id: string | null;
    party_name: string | null;
    document_number: string | null;
    description: string;
    currency: string;
    gross_minor: string;
    line_net_minor: string;
    line_vat_minor: string;
    cit_state: string;
    vat_state: string;
    has_vat_account: boolean;
    root_type: string | null;
    expense_class: string | null;
    funding_treatment: string | null;
    account_code: string;
    funding_financial_account_id: string | null;
    payment_method: string;
    paid_on: string | null;
    payment_evidence_ref: string | null;
    transaction_evidence: string;
    line_missing_flag: boolean;
  }>(
    `select 'expense'::text as source_type, e.id as source_id, l.line_number,
            e.expense_date::text as record_date, e.payee_party_id as party_id,
            p.display_name as party_name, null::text as document_number, l.description,
            e.currency, e.gross_minor::text, l.net_minor::text as line_net_minor,
            l.vat_minor::text as line_vat_minor, l.cit_state::text, l.vat_state::text,
            (l.vat_account_code is not null) as has_vat_account, a.root_type::text,
            e.expense_class::text, l.funding_treatment::text,
            e.counter_account_code as account_code, e.funding_financial_account_id,
            e.payment_method, e.paid_on::text, e.payment_evidence_ref,
            e.transaction_evidence, l.payment_evidence_missing as line_missing_flag
       from expenses e
       join expense_lines l on l.organization_id = e.organization_id and l.expense_id = e.id
       left join parties p on p.organization_id = e.organization_id and p.id = e.payee_party_id
       left join accounts a on a.organization_id = l.organization_id and a.code = l.posting_account_code
      where e.organization_id = $1 and e.state in ('approved', 'posted')
        and e.expense_class::text not in ('non_documented', 'owner_personal', 'petty_cash', 'prepaid', 'prepaid_asset', 'fixed_asset')
        and e.expense_date between $2::date and $3::date
     union all
     select 'purchase_invoice'::text as source_type, d.id as source_id, l.line_number,
            d.document_date::text as record_date, d.party_id, p.display_name as party_name,
            d.document_number, l.description, d.currency, d.gross_minor::text,
            l.net_minor::text as line_net_minor, l.tax_minor::text as line_vat_minor,
            l.cit_state::text, l.vat_state::text,
            (l.tax_account_code is not null) as has_vat_account, a.root_type::text,
            null::text as expense_class, null::text as funding_treatment,
            d.control_account_code as account_code, d.funding_financial_account_id,
            d.payment_method, d.paid_on::text, d.payment_evidence_ref,
            d.transaction_evidence, l.payment_evidence_missing as line_missing_flag
       from commercial_documents d
       join commercial_document_lines l on l.organization_id = d.organization_id and l.document_id = d.id
       left join parties p on p.organization_id = d.organization_id and p.id = d.party_id
       left join accounts a on a.organization_id = l.organization_id and a.code = l.primary_account_code
      where d.organization_id = $1 and d.type = 'purchase_invoice'
        and d.state in ('approved', 'posted', 'partially_paid', 'paid')
        and d.document_date between $2::date and $3::date
      order by record_date desc, source_type, source_id, line_number`,
    [organizationId, query.startsOn, query.endsOn],
  );

  const uniqueSources = new Map<string, SameDaySupplierInvoiceSlice>();
  const reconciledBySource = new Map<string, string | null>();
  for (const row of sourceRows.rows) {
    const key = `${row.source_type}:${row.source_id}`;
    if (!uniqueSources.has(key)) {
      const reconciled = await lookupReconciledBankPayment(
        pool,
        organizationId,
        row.source_type === "expense" ? "expense" : "commercial_document",
        row.source_id,
      );
      const reconciledPaidOn =
        reconciled.paidMinor >= BigInt(row.gross_minor) ? reconciled.paidOn : null;
      reconciledBySource.set(key, reconciledPaidOn);
      const isOwnerPaid =
        !row.funding_financial_account_id &&
        (ownerCodes.has(row.account_code) || row.funding_treatment === "owner_paid_company_cost");
      uniqueSources.set(key, {
        sourceType: row.source_type,
        sourceId: row.source_id,
        partyId: row.party_id,
        date: row.record_date,
        grossMinor: BigInt(row.gross_minor),
        paymentMethod: asPaymentMethod(row.payment_method),
        paidOn: row.paid_on,
        paymentEvidenceRef: row.payment_evidence_ref,
        isOwnerPaid,
        isBankReconciled: Boolean(reconciledPaidOn),
      });
    }
  }

  const dailyTotals = computeSameDaySupplierTotals([...uniqueSources.values()]);
  const items: PaymentEvidenceGapItem[] = [];
  const seenGapRecordGross = new Map<string, bigint>();
  let withheldCitTotal = 0n;
  let withheldVatTotal = 0n;

  for (const row of sourceRows.rows) {
    const sourceKey = `${row.source_type}:${row.source_id}`;
    const slice = uniqueSources.get(sourceKey)!;
    const reconciledPaidOn = reconciledBySource.get(sourceKey) ?? null;
    const sameDayGross = row.party_id
      ? (dailyTotals.get(`${row.party_id}::${row.record_date}`) ?? BigInt(row.gross_minor))
      : BigInt(row.gross_minor);
    const hasInputVat = row.has_vat_account && BigInt(row.line_vat_minor) > 0n;
    const citEligibleBase = row.root_type !== "asset";

    const decision = evaluatePaymentDeductibility({
      grossMinor: BigInt(row.gross_minor),
      hasInputVat,
      thresholdMinor,
      paymentMethod: slice.paymentMethod,
      paidOn: slice.paidOn,
      paymentEvidenceRef: slice.paymentEvidenceRef,
      transactionEvidence: asTransactionEvidence(row.transaction_evidence),
      isOwnerPaid: slice.isOwnerPaid,
      reconciledBankPaidOn: reconciledPaidOn,
      sameDaySupplierGrossMinor: sameDayGross,
    });

    const withheldCit =
      citEligibleBase && decision.citGatedByPayment && row.cit_state === "unreviewed"
        ? BigInt(row.line_net_minor)
        : 0n;
    const withheldVat =
      hasInputVat && decision.vatGatedByPayment && row.vat_state === "unreviewed"
        ? BigInt(row.line_vat_minor)
        : 0n;

    if (
      !decision.paymentEvidenceMissing ||
      (withheldCit === 0n && withheldVat === 0n && !row.line_missing_flag)
    ) {
      continue;
    }

    seenGapRecordGross.set(sourceKey, BigInt(row.gross_minor));
    withheldCitTotal += withheldCit;
    withheldVatTotal += withheldVat;
    items.push({
      id: `${row.source_type === "expense" ? "expense" : "document"}:${row.source_id}:${row.line_number}`,
      sourceType: row.source_type,
      sourceId: row.source_id,
      lineNumber: row.line_number,
      date: row.record_date,
      partyId: row.party_id,
      partyName: row.party_name,
      documentNumber: row.document_number,
      description: row.description,
      currency: row.currency,
      grossMinor: row.gross_minor,
      sameDaySupplierGrossMinor: decision.sameDaySupplierGrossMinor.toString(),
      lineNetMinor: row.line_net_minor,
      lineVatMinor: row.line_vat_minor,
      withheldCitMinor: withheldCit.toString(),
      withheldVatMinor: withheldVat.toString(),
      citState: row.cit_state,
      vatState: row.vat_state,
      paymentMethod: decision.effectivePaymentMethod,
      paidOn: decision.effectivePaidOn,
      paymentEvidenceRef: row.payment_evidence_ref,
      transactionEvidence: asTransactionEvidence(row.transaction_evidence),
      isOwnerPaid: slice.isOwnerPaid,
      gapReasons: decision.gapReasons,
      nextActions: ["update-payment-evidence", "view-source"],
    });
  }

  const totalGapGross = [...seenGapRecordGross.values()].reduce((s, v) => s + v, 0n);
  return {
    schemaVersion: PAYMENT_EVIDENCE_CONTRACT_VERSION,
    organizationId,
    currency: baseCurrency,
    startsOn: query.startsOn,
    endsOn: query.endsOn,
    nonCashThresholdMinor: thresholdMinor.toString(),
    status: items.length > 0 ? "warning" : "ready",
    counts: {
      recordCount: seenGapRecordGross.size,
      lineCount: items.length,
    },
    totals: {
      grossMinor: totalGapGross.toString(),
      withheldCitMinor: withheldCitTotal.toString(),
      withheldVatMinor: withheldVatTotal.toString(),
    },
    items,
  };
}
