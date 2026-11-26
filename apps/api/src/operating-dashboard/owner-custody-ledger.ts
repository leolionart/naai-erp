import type { Pool } from "pg";

export type LedgerLiquidityAndOwnerSnapshot = Readonly<{
  bankAvailableMinor: bigint;
  companyCashOnHandMinor: bigint;
  ownerCashCustodyMinor: bigint;
  cashOnHandMinor: bigint;
  cashAndBankMinor: bigint;
  statutoryOwnerCurrentSignedMinor: bigint;
  ownerPayableMinor: bigint;
  confirmedOwnerSettlementMinor: bigint;
  companyOwesOwnerMinor: bigint;
  ownerHoldsCompanyFundsMinor: bigint;
  ownerReceivableMinor: bigint;
  netOwnerPositionMinor: bigint;
  hasUnmigratedCustodyEntries: boolean;
}>;

/**
 * Derive company bank, company cash (`111-CASH`), owner-held custody cash
 * (`111-OWNER-CUSTODY`), statutory owner current (`3388`), and owner receivable
 * (`1388`) directly from posted/reversed ledger lines as of `asOf` (`BR-FUND-007`).
 * Link-inference workarounds on `funding_financial_account_id` are removed.
 */
export async function readLedgerLiquidityAndOwnerSnapshot(
  pool: Pool,
  organizationId: string,
  asOf: string,
): Promise<LedgerLiquidityAndOwnerSnapshot> {
  const result = await pool.query<{
    bank_minor: string;
    company_cash_minor: string;
    owner_custody_minor: string;
    owner_current_signed_minor: string;
    owner_receivable_minor: string;
    eligible_owner_expenses_minor: string;
    has_unmigrated_custody: boolean;
  }>(
    `with workflow_policy as (
       select operating_mode from accounting_workflow_policies where organization_id=$1
     ), selected_mapping as (
       select id, version
         from financial_statement_mapping_versions
        where organization_id=$1 and framework='TT133'
          and (state='approved' or coalesce((select operating_mode from workflow_policy),'controlled')='solopreneur')
          and effective_from <= $2::date and (effective_to is null or effective_to >= $2::date)
        order by (state='approved') desc, effective_from desc, version desc limit 1
     ), owner_accounts as (
       select distinct ml.account_code
         from selected_mapping sm
         join financial_statement_mapping_lines ml
           on ml.organization_id=$1 and ml.mapping_id=sm.id and ml.mapping_version=sm.version
        where ml.statement='balance_sheet' and ml.line_code='owner_current'
     ), receivable_accounts as (
       select code as account_code from accounts
        where organization_id=$1 and root_type='asset' and code in ('1388', '1388-OWNER')
       union
       select e.child_code from account_hierarchy_edges e
        where e.organization_id=$1 and e.parent_code='1388' and e.child_root_type='asset'
          and e.child_code <> '1388-TRANSIT'
       union
       select ml.account_code
         from selected_mapping sm
         join financial_statement_mapping_lines ml
           on ml.organization_id=$1 and ml.mapping_id=sm.id and ml.mapping_version=sm.version
        where ml.statement='balance_sheet' and ml.line_code='owner_receivable'
     ), bank_accounts as (
       select distinct ledger_account_code as account_code
         from financial_accounts
        where organization_id=$1 and status='active' and kind='bank'
     ), custody_accounts as (
       select code as account_code from accounts
        where organization_id=$1 and root_type='asset' and code='111-OWNER-CUSTODY'
       union
       select fa.ledger_account_code
         from financial_accounts fa
        where fa.organization_id=$1 and fa.status='active' and fa.code='CASH-OWNER-CUSTODY'
          and fa.ledger_account_code not in ('111', '111-CASH')
          and not exists (
            select 1 from financial_accounts other
             where other.organization_id=$1 and other.status='active'
               and other.code <> 'CASH-OWNER-CUSTODY'
               and other.ledger_account_code = fa.ledger_account_code
          )
     ), company_cash_accounts as (
       select distinct ledger_account_code as account_code
         from financial_accounts
        where organization_id=$1 and status='active' and kind='cash'
          and ledger_account_code not in (select account_code from custody_accounts)
       union
       select code from accounts
        where organization_id=$1 and root_type='asset' and code='111-CASH'
     ), eligible_owner_expenses as (
       select coalesce(sum(l.gross_minor), 0) as amount
         from expenses e
         join expense_lines l on l.organization_id=e.organization_id and l.expense_id=e.id
         left join expense_categories c on c.organization_id=l.organization_id
           and c.code=coalesce(l.expense_category_code, l.dimensions->>'category')
         join journal_entries j on j.organization_id=e.organization_id and j.id=e.journal_id
        where e.organization_id=$1 and e.state='posted' and j.state in ('posted','reversed')
          and e.expense_date <= $2::date
          and e.counter_account_code in (select account_code from owner_accounts)
          and coalesce(l.funding_treatment, c.funding_treatment)='owner_paid_company_cost'
     ), migrated_keys as (
       select jl.dimensions->>'ownerCustodyMigrationSourceKey' as src_key
         from journal_entries je
         join journal_lines jl on jl.organization_id=je.organization_id and jl.journal_id=je.id
        where je.organization_id=$1 and je.state='posted' and je.reversal_of_id is null
          and jl.dimensions ? 'ownerCustodyMigrationSourceKey'
     ), unmigrated_custody as (
       select exists(
         select 1
           from journal_entries j
           join journal_lines l on l.organization_id=j.organization_id and l.journal_id=j.id
           join financial_accounts fa on fa.organization_id=$1 and fa.code='CASH-OWNER-CUSTODY'
          where j.organization_id=$1 and j.state='posted' and j.journal_date <= $2::date
            and l.account_code like '111%' and l.account_code <> '111-OWNER-CUSTODY'
            and not exists (select 1 from migrated_keys mk where mk.src_key = (j.id || ':' || l.line_number::text))
            and (
              exists (select 1 from expenses e where e.organization_id=$1 and e.journal_id=j.id and e.state='posted' and e.funding_financial_account_id=fa.id)
              or exists (select 1 from commercial_documents d where d.organization_id=$1 and d.journal_id=j.id and d.type='purchase_invoice' and d.state in ('posted','partially_paid','paid') and d.funding_financial_account_id=fa.id)
              or exists (
                select 1 from internal_transfer_attempts ita
                join bank_transactions bt on bt.organization_id=ita.organization_id
                  and bt.id in (ita.incoming_transaction_id, ita.outgoing_transaction_id)
                  and bt.financial_account_id=fa.id
                where ita.organization_id=$1 and ita.state='reconciled'
                  and j.id in (ita.outgoing_journal_id, ita.incoming_journal_id)
              )
            )
       ) as flag
     )
     select
       coalesce((
         select sum(coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0))
           from journal_entries j
           join journal_lines l on l.organization_id=j.organization_id and l.journal_id=j.id
          where j.organization_id=$1 and j.state in ('posted','reversed') and j.journal_date <= $2::date
            and l.account_code in (select account_code from bank_accounts)
       ), 0)::text as bank_minor,
       coalesce((
         select sum(coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0))
           from journal_entries j
           join journal_lines l on l.organization_id=j.organization_id and l.journal_id=j.id
          where j.organization_id=$1 and j.state in ('posted','reversed') and j.journal_date <= $2::date
            and l.account_code in (select account_code from company_cash_accounts)
       ), 0)::text as company_cash_minor,
       coalesce((
         select sum(coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0))
           from journal_entries j
           join journal_lines l on l.organization_id=j.organization_id and l.journal_id=j.id
          where j.organization_id=$1 and j.state in ('posted','reversed') and j.journal_date <= $2::date
            and l.account_code in (select account_code from custody_accounts)
       ), 0)::text as owner_custody_minor,
       coalesce((
         select sum(coalesce(l.credit_minor,0)-coalesce(l.debit_minor,0))
           from journal_entries j
           join journal_lines l on l.organization_id=j.organization_id and l.journal_id=j.id
          where j.organization_id=$1 and j.state in ('posted','reversed') and j.journal_date <= $2::date
            and l.account_code in (select account_code from owner_accounts)
       ), 0)::text as owner_current_signed_minor,
       coalesce((
         select sum(coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0))
           from journal_entries j
           join journal_lines l on l.organization_id=j.organization_id and l.journal_id=j.id
          where j.organization_id=$1 and j.state in ('posted','reversed') and j.journal_date <= $2::date
            and l.account_code in (select account_code from receivable_accounts)
       ), 0)::text as owner_receivable_minor,
       (select amount from eligible_owner_expenses)::text as eligible_owner_expenses_minor,
       (select flag from unmigrated_custody) as has_unmigrated_custody`,
    [organizationId, asOf],
  );
  const row = result.rows[0];
  const bankAvailableMinor = BigInt(row?.bank_minor ?? "0");
  const companyCashOnHandMinor = BigInt(row?.company_cash_minor ?? "0");
  const ownerCashCustodyMinor = BigInt(row?.owner_custody_minor ?? "0");
  const cashOnHandMinor = companyCashOnHandMinor + ownerCashCustodyMinor;
  const cashAndBankMinor = bankAvailableMinor + cashOnHandMinor;
  const statutoryOwnerCurrentSignedMinor = BigInt(row?.owner_current_signed_minor ?? "0");
  const ownerPayableMinor =
    statutoryOwnerCurrentSignedMinor > 0n ? statutoryOwnerCurrentSignedMinor : 0n;
  const confirmedOwnerSettlementMinor = BigInt(row?.eligible_owner_expenses_minor ?? "0");
  const companyOwesOwnerMinor =
    confirmedOwnerSettlementMinor > 0n ? confirmedOwnerSettlementMinor : 0n;
  const ownerHoldsCompanyFundsMinor = ownerCashCustodyMinor > 0n ? ownerCashCustodyMinor : 0n;
  const ownerReceivableMinor = BigInt(row?.owner_receivable_minor ?? "0");
  const netOwnerPositionMinor = statutoryOwnerCurrentSignedMinor - ownerReceivableMinor;
  return {
    bankAvailableMinor,
    companyCashOnHandMinor,
    ownerCashCustodyMinor,
    cashOnHandMinor,
    cashAndBankMinor,
    statutoryOwnerCurrentSignedMinor,
    ownerPayableMinor,
    confirmedOwnerSettlementMinor,
    companyOwesOwnerMinor,
    ownerHoldsCompanyFundsMinor,
    ownerReceivableMinor,
    netOwnerPositionMinor,
    hasUnmigratedCustodyEntries: Boolean(row?.has_unmigrated_custody),
  };
}
