import { DEFAULT_NON_CASH_THRESHOLD_MINOR } from "@naai-erp/domain";
import type { PoolClient } from "pg";

export type Queryable = Pick<PoolClient, "query">;

export async function resolveNonCashThresholdMinor(
  client: Queryable,
  organizationId: string,
): Promise<bigint> {
  const result = await client.query<{ non_cash_threshold_minor: string | null }>(
    `select non_cash_threshold_minor::text from accounting_workflow_policies where organization_id = $1`,
    [organizationId],
  );
  const raw = result.rows[0]?.non_cash_threshold_minor;
  return raw === null || raw === undefined ? DEFAULT_NON_CASH_THRESHOLD_MINOR : BigInt(raw);
}

export async function resolveOwnerCurrentAccountCodes(
  client: Queryable,
  organizationId: string,
  asOfDate: string,
): Promise<ReadonlySet<string>> {
  const result = await client.query<{ account_code: string }>(
    `select distinct account_code from (
       select ml.account_code
         from financial_statement_mapping_versions v
         join financial_statement_mapping_lines ml
           on ml.organization_id = v.organization_id
          and ml.mapping_id = v.id
          and ml.mapping_version = v.version
        where v.organization_id = $1
          and v.effective_from <= $2::date
          and (v.effective_to is null or v.effective_to >= $2::date)
          and ml.statement = 'balance_sheet'
          and ml.line_code = 'owner_current'
       union
       select code as account_code
         from accounts
        where organization_id = $1 and code like '3388%'
     ) owner_codes`,
    [organizationId, asOfDate],
  );
  return new Set(result.rows.map((row) => row.account_code));
}

export async function lookupReconciledBankPayment(
  client: Queryable,
  organizationId: string,
  targetType: "expense" | "commercial_document",
  targetId: string,
): Promise<{ paidMinor: bigint; paidOn: string | null; reference: string | null }> {
  const column = targetType === "expense" ? "expense_id" : "commercial_document_id";
  const result = await client.query<{
    paid_minor: string;
    paid_on: string | null;
    ref: string | null;
  }>(
    `select coalesce(sum(ra.target_amount_minor), 0)::text as paid_minor,
            max(bt.booking_date)::text as paid_on,
            max(coalesce(nullif(btrim(bt.reference), ''), 'bank_tx:' || bt.id)) as ref
       from reconciliation_allocations ra
       join reconciliation_attempts rat
         on rat.organization_id = ra.organization_id and rat.id = ra.reconciliation_id
       join payment_reconciliations pr
         on pr.organization_id = rat.organization_id
        and pr.id = rat.reconciliation_id
        and pr.direction = 'payment'
       join bank_transactions bt
         on bt.organization_id = rat.organization_id and bt.id = rat.bank_transaction_id
       join financial_accounts fa
         on fa.organization_id = bt.organization_id
        and fa.id = bt.financial_account_id
        and fa.kind = 'bank'
      where ra.organization_id = $1
        and ra.${column} = $2
        and rat.state = 'reconciled'`,
    [organizationId, targetId],
  );
  const row = result.rows[0];
  return {
    paidMinor: BigInt(row?.paid_minor ?? "0"),
    paidOn: row?.paid_on ?? null,
    reference: row?.ref ?? null,
  };
}

export type SameDayActiveSource = {
  sourceType: "expense" | "purchase_invoice";
  sourceId: string;
};

export async function querySameDaySupplierGrossMinor(
  client: Queryable,
  organizationId: string,
  partyId: string | null,
  date: string,
  activeSources: ReadonlyArray<SameDayActiveSource> = [],
): Promise<bigint> {
  if (!partyId) return 0n;
  const includeDocIds = activeSources
    .filter((s) => s.sourceType === "purchase_invoice")
    .map((s) => s.sourceId);
  const includeExpIds = activeSources
    .filter((s) => s.sourceType === "expense")
    .map((s) => s.sourceId);
  const result = await client.query<{ total: string }>(
    `select coalesce(sum(gross_minor), 0)::text as total from (
       select d.gross_minor
         from commercial_documents d
        where d.organization_id = $1
          and d.type = 'purchase_invoice'
          and d.party_id = $2
          and d.document_date = $3::date
          and (
            d.state in ('approved', 'posted', 'partially_paid', 'paid')
            or (d.id = any($4::text[]) and d.state <> 'cancelled')
          )
       union all
       select e.gross_minor
         from expenses e
        where e.organization_id = $1
          and e.payee_party_id = $2
          and e.expense_date = $3::date
          and e.expense_class::text not in ('non_documented', 'owner_personal', 'petty_cash')
          and (
            e.state in ('approved', 'posted')
            or (e.id = any($5::text[]) and e.state not in ('reversed', 'rejected'))
          )
     ) same_day`,
    [organizationId, partyId, date, includeDocIds, includeExpIds],
  );
  return BigInt(result.rows[0]?.total ?? "0");
}
