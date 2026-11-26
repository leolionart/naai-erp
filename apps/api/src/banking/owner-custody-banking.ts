import type { Pool, PoolClient } from "pg";

export const OWNER_CUSTODY_LEDGER_CODE = "111-OWNER-CUSTODY";
export const COMPANY_CASH_LEDGER_CODE = "111-CASH";
export const OWNER_RECEIVABLE_CODES = ["1388", "1388-OWNER"] as const;

export type OwnerCurrentMovementType =
  | "company_repayment_to_owner"
  | "owner_custody_cash"
  | "owner_personal_withdrawal"
  | "owner_funding"
  | "owner_paid_company_cost"
  | "adjustment";

export type OwnerCurrentClassificationBasis =
  | "canonical_owner_paid_expense"
  | "canonical_owner_custody_receipt"
  | "company_funds_withdrawn_by_owner"
  | "owner_funding_to_company_funds"
  | "company_funds_repayment_to_owner"
  | "unresolved_owner_current_movement";

export type OwnerCurrentSource = Readonly<{
  sourceType?: unknown;
  fundingTreatments?: unknown;
  fundingFinancialAccountCode?: unknown;
}>;

export function summarizeOwnerSettlement(input: {
  statutoryOwnerCurrentBalance: bigint;
  ownerPaidCompanyCost: bigint;
  ownerCustodyCash: bigint;
  ownerPersonalWithdrawal: bigint;
  ownerFunding: bigint;
  review: bigint;
  reviewCount: number;
  ledgerCustodyCash?: bigint | null;
}) {
  const hasDedicatedCustodyLedger =
    input.ledgerCustodyCash !== undefined && input.ledgerCustodyCash !== null;
  const confirmed = hasDedicatedCustodyLedger
    ? input.ownerPaidCompanyCost + input.ownerFunding - input.ownerPersonalWithdrawal
    : input.ownerPaidCompanyCost +
      input.ownerFunding -
      input.ownerCustodyCash -
      input.ownerPersonalWithdrawal;
  const custodyFunds = hasDedicatedCustodyLedger
    ? input.ledgerCustodyCash! > 0n
      ? input.ledgerCustodyCash!
      : 0n
    : confirmed < 0n
      ? -confirmed
      : 0n;
  return {
    statutoryOwnerCurrentBalanceMinor: input.statutoryOwnerCurrentBalance.toString(),
    confirmedSettlementBalanceMinor: confirmed.toString(),
    companyOwesOwnerMinor: (confirmed > 0n ? confirmed : 0n).toString(),
    ownerHoldsCompanyFundsMinor: custodyFunds.toString(),
    ownerPaidCompanyCostMinor: input.ownerPaidCompanyCost.toString(),
    ownerCustodyCashMinor: (hasDedicatedCustodyLedger
      ? input.ledgerCustodyCash!
      : input.ownerCustodyCash
    ).toString(),
    ownerPersonalWithdrawalMinor: input.ownerPersonalWithdrawal.toString(),
    ownerFundingMinor: input.ownerFunding.toString(),
    reviewMinor: input.review.toString(),
    reviewCount: input.reviewCount,
  };
}

export function classifyOwnerCurrentMovement(input: {
  ownerDelta: bigint;
  companyFundsDelta: bigint;
  sources: readonly OwnerCurrentSource[];
  reversalOfId?: string | null;
  custodyTransfer?: boolean;
  personalWithdrawal?: boolean;
}): {
  movementType: OwnerCurrentMovementType;
  classificationBasis: OwnerCurrentClassificationBasis;
  needsReview: boolean;
} {
  const direction = input.reversalOfId ? -1n : 1n;
  const ownerDelta = input.ownerDelta * direction;
  const companyFundsDelta = input.companyFundsDelta * direction;
  if (ownerDelta < 0n && companyFundsDelta < 0n && input.custodyTransfer) {
    return {
      movementType: "owner_custody_cash",
      classificationBasis: "canonical_owner_custody_receipt",
      needsReview: false,
    };
  }
  if (ownerDelta < 0n && companyFundsDelta < 0n && input.personalWithdrawal) {
    return {
      movementType: "owner_personal_withdrawal",
      classificationBasis: "company_funds_withdrawn_by_owner",
      needsReview: false,
    };
  }
  if (ownerDelta > 0n && companyFundsDelta > 0n) {
    return {
      movementType: "owner_funding",
      classificationBasis: "owner_funding_to_company_funds",
      needsReview: false,
    };
  }
  const hasCanonicalOwnerPaidEvidence = input.sources.some((source) => {
    return (
      source.sourceType === "expense" &&
      Array.isArray(source.fundingTreatments) &&
      source.fundingTreatments.includes("owner_paid_company_cost") &&
      source.fundingFinancialAccountCode !== "CASH-OWNER-CUSTODY"
    );
  });
  if (ownerDelta > 0n && hasCanonicalOwnerPaidEvidence) {
    return {
      movementType: "owner_paid_company_cost",
      classificationBasis: "canonical_owner_paid_expense",
      needsReview: false,
    };
  }
  return {
    movementType: "adjustment",
    classificationBasis: "unresolved_owner_current_movement",
    needsReview: true,
  };
}

export async function ensureDefaultCashAccountLedger(
  client: PoolClient,
  organizationId: string,
  financialAccountCode: string,
  requestedLedgerCode?: string,
  _actorId = "banking",
): Promise<string> {
  const code = financialAccountCode.trim();
  const explicit = requestedLedgerCode?.trim();
  if (explicit) return explicit;
  if (code !== "CASH-OWNER-CUSTODY" && code !== "CASH-COMPANY") {
    return "";
  }
  const targetLedger =
    code === "CASH-OWNER-CUSTODY" ? OWNER_CUSTODY_LEDGER_CODE : COMPANY_CASH_LEDGER_CODE;
  const targetName =
    code === "CASH-OWNER-CUSTODY" ? "Quỹ tiền mặt do chủ giữ" : "Quỹ tiền mặt công ty";
  await client.query(
    `insert into accounts (organization_id, code, name, root_type, is_control_account, allow_manual_posting, is_active)
     values ($1, '111', 'Tiền mặt', 'asset', false, true, true),
            ($1, $2, $3, 'asset', false, true, true)
     on conflict (organization_id, code) do nothing`,
    [organizationId, targetLedger, targetName],
  );
  await client.query(
    `insert into account_hierarchy_edges (organization_id, child_code, child_root_type, parent_code, parent_root_type)
     select $1, $2, 'asset'::account_root_type, '111', 'asset'::account_root_type
     where exists (select 1 from accounts where organization_id=$1 and code='111' and root_type='asset')
       and exists (select 1 from accounts where organization_id=$1 and code=$2 and root_type='asset')
     on conflict (organization_id, child_code) do nothing`,
    [organizationId, targetLedger],
  );
  return targetLedger;
}

export async function readOwnerCurrentLedgerBalances(
  pool: Pool,
  organizationId: string,
  statutoryOwnerCurrentBalance: bigint,
) {
  const res = await pool.query<{
    has_custody_account: boolean;
    owner_custody_minor: string;
    company_cash_minor: string;
    owner_receivable_minor: string;
  }>(
    `with selected_mapping as (
       select id, version
         from financial_statement_mapping_versions
        where organization_id=$1 and framework='TT133'
          and (state='approved' or exists(select 1 from accounting_workflow_policies w where w.organization_id=$1 and w.operating_mode='solopreneur'))
        order by (state='approved') desc, effective_from desc, version desc limit 1
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
     ), company_cash_accounts as (
       select distinct ledger_account_code as account_code
         from financial_accounts
        where organization_id=$1 and status='active' and kind='cash'
          and ledger_account_code <> '111-OWNER-CUSTODY'
       union
       select code from accounts
        where organization_id=$1 and code='111-CASH' and root_type='asset'
     )
     select
       exists(
         select 1 from accounts where organization_id=$1 and code='111-OWNER-CUSTODY'
         and exists(
           select 1 from financial_accounts
            where organization_id=$1 and code='CASH-OWNER-CUSTODY' and ledger_account_code='111-OWNER-CUSTODY'
           union all
           select 1 from journal_lines jl join journal_entries je
             on je.organization_id=jl.organization_id and je.id=jl.journal_id
            where jl.organization_id=$1 and jl.account_code='111-OWNER-CUSTODY'
              and je.state in ('posted','reversed')
         )
       ) as has_custody_account,
       coalesce((
         select sum(coalesce(l.debit_minor,0) - coalesce(l.credit_minor,0))
           from journal_entries j
           join journal_lines l on l.organization_id=j.organization_id and l.journal_id=j.id
          where j.organization_id=$1 and j.state in ('posted','reversed')
            and l.account_code='111-OWNER-CUSTODY'
       ), 0)::text as owner_custody_minor,
       coalesce((
         select sum(coalesce(l.debit_minor,0) - coalesce(l.credit_minor,0))
           from journal_entries j
           join journal_lines l on l.organization_id=j.organization_id and l.journal_id=j.id
          where j.organization_id=$1 and j.state in ('posted','reversed')
            and l.account_code in (select account_code from company_cash_accounts)
       ), 0)::text as company_cash_minor,
       coalesce((
         select sum(coalesce(l.debit_minor,0) - coalesce(l.credit_minor,0))
           from journal_entries j
           join journal_lines l on l.organization_id=j.organization_id and l.journal_id=j.id
          where j.organization_id=$1 and j.state in ('posted','reversed')
            and l.account_code in (select account_code from receivable_accounts)
       ), 0)::text as owner_receivable_minor`,
    [organizationId],
  );
  const row = res.rows[0];
  const ownerCustodyMinor = BigInt(row?.owner_custody_minor ?? "0");
  const companyCashMinor = BigInt(row?.company_cash_minor ?? "0");
  const ownerReceivableMinor = BigInt(row?.owner_receivable_minor ?? "0");
  const netOwnerPositionMinor = statutoryOwnerCurrentBalance - ownerReceivableMinor;
  return {
    hasDedicatedCustodyLedger: Boolean(row?.has_custody_account),
    ownerCustodyMinor,
    companyCashMinor,
    ownerReceivableMinor,
    ledgerBalances: {
      ownerCustodyCashMinor: ownerCustodyMinor.toString(),
      companyCashOnHandMinor: companyCashMinor.toString(),
      ownerPayableMinor: (statutoryOwnerCurrentBalance > 0n
        ? statutoryOwnerCurrentBalance
        : 0n
      ).toString(),
      ownerReceivableMinor: ownerReceivableMinor.toString(),
      netOwnerPositionMinor: netOwnerPositionMinor.toString(),
    },
  };
}
