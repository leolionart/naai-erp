import type { Pool } from "pg";

export function deriveCompanyFunds(input: {
  bankAvailableMinor: bigint;
  companyCashOnHandMinor: bigint;
  ownerHoldsCompanyFundsMinor: bigint;
  cashAndBankMinor: bigint;
  rawOwnerCustodyMinor?: bigint;
}) {
  const positiveCompanyCash = input.companyCashOnHandMinor > 0n ? input.companyCashOnHandMinor : 0n;
  const totalMinor =
    input.bankAvailableMinor + positiveCompanyCash + input.ownerHoldsCompanyFundsMinor;
  const rawCustody = input.rawOwnerCustodyMinor ?? input.ownerHoldsCompanyFundsMinor;
  const ledgerPartitionMinor =
    input.bankAvailableMinor + positiveCompanyCash + (rawCustody > 0n ? rawCustody : 0n);
  return {
    totalMinor,
    reconciliationGapMinor: input.cashAndBankMinor - ledgerPartitionMinor,
  };
}

export function queryDashboardOwnerSettlement(pool: Pool, org: string, asOf: string) {
  return pool.query<{
    settlement: string;
    company_owes_owner: string;
    owner_holds_company_funds: string;
    custody: string;
    personal_withdrawals: string;
  }>(
    `with workflow_policy as (
       select operating_mode from accounting_workflow_policies where organization_id=$1
     ), selected_mapping as (
       select id,version
       from financial_statement_mapping_versions
       where organization_id=$1 and framework='TT133'
         and (state='approved' or coalesce((select operating_mode from workflow_policy),'controlled')='solopreneur')
         and effective_from<=$2::date and (effective_to is null or effective_to>=$2::date)
       order by (state='approved') desc,effective_from desc,version desc limit 1
     ), owner_accounts as (
       select distinct ml.account_code
       from selected_mapping sm
       join financial_statement_mapping_lines ml
         on ml.organization_id=$1 and ml.mapping_id=sm.id and ml.mapping_version=sm.version
       where ml.statement='balance_sheet' and ml.line_code='owner_current'
     ), eligible_owner_expenses as (
       select coalesce(sum(l.gross_minor),0) amount
       from expenses e
       join expense_lines l on l.organization_id=e.organization_id and l.expense_id=e.id
       left join expense_categories c on c.organization_id=l.organization_id
         and c.code=coalesce(l.expense_category_code,l.dimensions->>'category')
       join journal_entries j on j.organization_id=e.organization_id and j.id=e.journal_id
       where e.organization_id=$1 and e.state='posted' and j.state in ('posted','reversed')
         and e.expense_date<=$2::date
         and e.counter_account_code in (select account_code from owner_accounts)
         and coalesce(l.funding_treatment,c.funding_treatment)='owner_paid_company_cost'
         and (e.funding_financial_account_id is null or e.funding_financial_account_id<> (select id from financial_accounts where organization_id=$1 and code='CASH-OWNER-CUSTODY'))
     ), eligible_owner_purchase_invoices as (
       select coalesce(sum(dl.gross_minor),0) amount
       from commercial_documents d
       join commercial_document_lines dl on dl.organization_id=d.organization_id and dl.document_id=d.id
       join expense_categories c on c.organization_id=dl.organization_id
         and c.code=coalesce(dl.category_code,dl.dimensions->>'category')
         and c.is_active=true
       join journal_entries j on j.organization_id=d.organization_id and j.id=d.journal_id
       where d.organization_id=$1 and d.type='purchase_invoice'
         and d.state in ('posted','partially_paid','paid')
         and j.state in ('posted','reversed')
         and d.document_date<=$2::date
         and d.control_account_code in (select account_code from owner_accounts)
         and c.funding_treatment='owner_paid_company_cost'
         and (d.funding_financial_account_id is null or d.funding_financial_account_id<> (select id from financial_accounts where organization_id=$1 and code='CASH-OWNER-CUSTODY'))
     ), custody_incoming as (
       select coalesce(sum(it.transfer_amount_minor),0) amount
       from internal_transfers it
       join internal_transfer_attempts ita on ita.organization_id=it.organization_id
         and ita.transfer_id=it.id and ita.attempt_number=it.current_attempt_number
         and ita.state='reconciled'
       join bank_transactions incoming on incoming.organization_id=ita.organization_id
         and incoming.id=ita.incoming_transaction_id and incoming.booking_date<=$2::date
       join financial_accounts fa on fa.organization_id=incoming.organization_id
         and fa.id=incoming.financial_account_id
       where it.organization_id=$1 and fa.code='CASH-OWNER-CUSTODY'
     ), custody_expenses as (
       select coalesce(sum(e.gross_minor),0) amount
       from expenses e
       join journal_entries j on j.organization_id=e.organization_id and j.id=e.journal_id
       join financial_accounts fa on fa.organization_id=e.organization_id
         and fa.code='CASH-OWNER-CUSTODY'
         and e.funding_financial_account_id=fa.id
       where e.organization_id=$1 and e.state='posted'
         and j.state in ('posted','reversed')
         and e.expense_date<=$2::date
     ), custody_purchase_invoices as (
       select coalesce(sum(d.gross_minor),0) amount
       from commercial_documents d
       join financial_accounts fa on fa.organization_id=d.organization_id
         and fa.id=d.funding_financial_account_id
         and fa.code='CASH-OWNER-CUSTODY'
       where d.organization_id=$1 and d.type='purchase_invoice'
         and d.state in ('posted','partially_paid','paid')
         and d.document_date<=$2::date
     ), custody as (
       select greatest(
         (select amount from custody_incoming)
         - (select amount from custody_expenses)
         - (select amount from custody_purchase_invoices)
       ) amount
     ), owner_bank_movements as (
       select
         coalesce(sum(case when m.movement_type='owner_funding' then m.amount_minor else 0 end),0) funded,
         coalesce(sum(case when m.movement_type='owner_repayment' then m.amount_minor else 0 end),0) repaid
       from owner_funding_movements m
       join journal_entries j on j.organization_id=m.organization_id and j.id=m.journal_id
       where m.organization_id=$1
         and j.state='posted'
         and m.booking_date<=$2::date
     ), totals as (
       select (select amount from eligible_owner_expenses)
         + (select amount from eligible_owner_purchase_invoices)
         + (select funded from owner_bank_movements)
         - (select repaid from owner_bank_movements)
         - greatest((select amount from custody), 0) settlement
     )
     select settlement::text,
       greatest(settlement,0)::text company_owes_owner,
       greatest(-settlement,0)::text owner_holds_company_funds,
       (select amount from custody)::text custody,
       '0'::text personal_withdrawals
     from totals`,
    [org, asOf],
  );
}
