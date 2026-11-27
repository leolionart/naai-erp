import { resolvePgCitEstimate } from "../cit-policy/pg-cit-estimate.js";
import { readLedgerLiquidityAndOwnerSnapshot } from "./owner-custody-ledger.js";
import { buildNegativeCustodyAlert } from "../period-close/period-close-accounts.helper.js";
import { summarizePaymentEvidenceGaps } from "../payment-evidence/tax-report-enrichment.js";
import type { OperatingDashboardQuery } from "./operating-dashboard.types.js";
import { deriveCompanyFunds } from "./operating-dashboard-settlement.sql.js";
import { amount, ratioBps } from "./pg-operating-dashboard.store.shared.js";
import type { PgOperatingDashboardStore } from "./pg-operating-dashboard.store.js";

/**
 * Revenue/expense are summed in minor units, so only base-currency journals are included:
 * adding USD and VND minor units would silently produce a meaningless total.
 */
export async function financialsOperation(
  this: PgOperatingDashboardStore,
  org: string,
  q: OperatingDashboardQuery,
  baseCurrency: string,
) {
  const [monthlyResult, cash, liquiditySnapshot, expenseFunding, readiness] = await Promise.all([
    this.pool.query<{ period: string; revenue: string; expense: string }>(
      `select
         to_char(j.journal_date, 'YYYY-MM') period,
         coalesce(sum(coalesce(l.credit_minor,0)-coalesce(l.debit_minor,0)) filter (where a.root_type='revenue'),0)::text revenue,
         coalesce(sum(coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0)) filter (where a.root_type='expense'),0)::text expense
       from journal_entries j
       join journal_lines l on l.organization_id=j.organization_id and l.journal_id=j.id
       join accounts a on a.organization_id=l.organization_id and a.code=l.account_code
      where j.organization_id=$1 and j.state in ('posted','reversed')
        and j.currency=$4
        and j.journal_date between $2::date and $3::date
      group by to_char(j.journal_date, 'YYYY-MM')
      order by to_char(j.journal_date, 'YYYY-MM')`,
      [org, q.startsOn, q.endsOn, baseCurrency],
    ),
    this.pool.query<{ amount: string | null }>(
      `with workflow_policy as (
         select operating_mode from accounting_workflow_policies where organization_id=$1
       ), selected_policy as (
         select * from executive_metric_policy_versions
         where organization_id=$1 and (state='approved' or coalesce((select operating_mode from workflow_policy),'controlled')='solopreneur')
           and effective_from<=$2::date and (effective_to is null or effective_to>=$2::date)
         order by (state='approved') desc,effective_from desc,version desc,approved_at desc nulls last,id desc limit 1
       ) select sum(
         (case when a.root_type in ('liability','equity','revenue')
           then coalesce(l.credit_minor,0)-coalesce(l.debit_minor,0)
           else coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0) end) * m.sign
       )::text amount
       from selected_policy p
       join executive_metric_semantic_mappings m
         on m.organization_id=p.organization_id and m.policy_id=p.id and m.policy_version=p.version
       join accounts a on a.organization_id=m.organization_id and a.code=m.account_code
       join journal_lines l on l.organization_id=a.organization_id and l.account_code=a.code
       join journal_entries j on j.organization_id=l.organization_id and j.id=l.journal_id
      where p.organization_id=$1 and m.semantic='unrestricted_cash'
        and j.state in ('posted','reversed') and j.journal_date<=$2::date`,
      [org, q.asOf],
    ),
    readLedgerLiquidityAndOwnerSnapshot(this.pool, org, q.asOf),
    this.pool.query<{
      owner_paid: string;
      cit_ineligible: string;
      unclassified_count: number;
      unclassified_minor: string;
      category_count: number;
    }>(
      `with workflow_policy as (select operating_mode from accounting_workflow_policies where organization_id=$1), selected_mapping as (
           select id,version
           from financial_statement_mapping_versions
           where organization_id=$1 and framework='TT133' and (state='approved' or coalesce((select operating_mode from workflow_policy),'controlled')='solopreneur')
             and effective_from<=$2::date and (effective_to is null or effective_to>=$2::date)
           order by (state='approved') desc,effective_from desc,version desc limit 1
         ), owner_accounts as (
           select distinct ml.account_code
           from selected_mapping sm
         join financial_statement_mapping_lines ml
           on ml.organization_id=$1 and ml.mapping_id=sm.id and ml.mapping_version=sm.version
         where ml.statement='balance_sheet' and ml.line_code='owner_current'
         )
         select
           coalesce(sum(l.gross_minor) filter (
             where e.counter_account_code in (select account_code from owner_accounts)
               and coalesce(l.funding_treatment,c.funding_treatment)='owner_paid_company_cost'
           ),0)::text owner_paid,
           count(*) filter (
             where l.funding_treatment is null
               and e.counter_account_code in (select account_code from owner_accounts)
               and coalesce((select operating_mode from workflow_policy),'controlled')<>'solopreneur'
           )::int unclassified_count,
           coalesce(sum(l.gross_minor) filter (
             where l.funding_treatment is null
               and e.counter_account_code in (select account_code from owner_accounts)
               and coalesce((select operating_mode from workflow_policy),'controlled')<>'solopreneur'
           ),0)::text unclassified_minor,
           (coalesce(sum(l.net_minor) filter (where (l.cit_state='ineligible' or (l.payment_evidence_missing and l.cit_state='unreviewed')) and j.state in ('posted','reversed') and pa.root_type='expense'),0) + coalesce((select sum(cl.net_minor) from commercial_document_lines cl join commercial_documents cd on cd.organization_id=cl.organization_id and cd.id=cl.document_id left join accounts cpa on cpa.organization_id=cl.organization_id and cpa.code=cl.primary_account_code where cl.organization_id=$1 and (cl.cit_state='ineligible' or (cl.payment_evidence_missing and cl.cit_state='unreviewed')) and coalesce(cpa.root_type,'expense')='expense' and cd.type='purchase_invoice' and cd.state in ('issued','posted','partially_paid','paid') and cd.document_date between $2::date and $3::date),0))::text cit_ineligible,
           (select count(*)::int from expense_categories c where c.organization_id=$1 and c.is_active=true) category_count
         from expenses e
         join expense_lines l on l.organization_id=e.organization_id and l.expense_id=e.id
         left join accounts pa on pa.organization_id=l.organization_id and pa.code=l.posting_account_code
         left join expense_categories c on c.organization_id=l.organization_id and c.code=l.expense_category_code
         join journal_entries j on j.organization_id=e.organization_id and j.id=e.journal_id
         where e.organization_id=$1 and e.state='posted' and e.expense_date between $2::date and $3::date
           and j.state in ('posted','reversed')`,
      [org, q.startsOn, q.endsOn],
    ),
    this.pool.query<{
      recognition_count: number;
      budget_count: number;
      operating_mode: "controlled" | "solopreneur";
      approved_statement_mapping_count: number;
      effective_statement_mapping_count: number;
      approved_executive_policy_count: number;
      effective_executive_policy_count: number;
      approved_cit_policy_count: number;
      effective_cit_policy_count: number;
    }>(
      `select
        (select count(*)::int from revenue_recognition_events where organization_id=$1 and state='posted' and effective_on between $2::date and $3::date) recognition_count,
        (select count(*)::int from project_budget_versions b where organization_id=$1 and (state='approved' or exists (select 1 from accounting_workflow_policies w where w.organization_id=$1 and w.operating_mode='solopreneur'))) budget_count,
        coalesce((select operating_mode from accounting_workflow_policies where organization_id=$1),'controlled') operating_mode,
        (select count(*)::int from financial_statement_mapping_versions where organization_id=$1 and state='approved' and effective_from<=$3::date and (effective_to is null or effective_to>=$3::date)) approved_statement_mapping_count,
        (select count(*)::int from financial_statement_mapping_versions where organization_id=$1 and effective_from<=$3::date and (effective_to is null or effective_to>=$3::date)) effective_statement_mapping_count,
        (select count(*)::int from executive_metric_policy_versions where organization_id=$1 and state='approved' and effective_from<=$3::date and (effective_to is null or effective_to>=$3::date)) approved_executive_policy_count,
        (select count(*)::int from executive_metric_policy_versions where organization_id=$1 and effective_from<=$3::date and (effective_to is null or effective_to>=$3::date)) effective_executive_policy_count,
        (select count(*)::int from tax_code_versions where organization_id=$1 and kind='cit' and review_state='accountant_approved' and effective_from<=$3::date and (effective_to is null or effective_to>=$3::date)) approved_cit_policy_count,
        (select count(*)::int from tax_code_versions where organization_id=$1 and kind='cit' and effective_from<=$3::date and (effective_to is null or effective_to>=$3::date)) effective_cit_policy_count`,
      [org, q.startsOn, q.endsOn],
    ),
  ]);
  const monthly = monthlyResult.rows.map((row) => ({
    period: row.period,
    revenueMinor: amount(row.revenue).toString(),
    expenseMinor: amount(row.expense).toString(),
    netProfitMinor: (amount(row.revenue) - amount(row.expense)).toString(),
  }));
  const revenue = monthlyResult.rows.reduce((sum, row) => sum + amount(row.revenue), 0n);
  const expense = monthlyResult.rows.reduce((sum, row) => sum + amount(row.expense), 0n);
  const netProfit = revenue - expense;
  const {
    bankAvailableMinor,
    companyCashOnHandMinor,
    ownerCashCustodyMinor,
    cashOnHandMinor,
    cashAndBankMinor,
    ownerPayableMinor,
    confirmedOwnerSettlementMinor,
    companyOwesOwnerMinor,
    ownerHoldsCompanyFundsMinor,
    ownerReceivableMinor,
    netOwnerPositionMinor,
    hasUnmigratedCustodyEntries,
  } = liquiditySnapshot;
  const companyFunds = deriveCompanyFunds({
    bankAvailableMinor,
    companyCashOnHandMinor,
    ownerHoldsCompanyFundsMinor,
    cashAndBankMinor,
  });
  const actualOwnerPaidCompanyCostMinor = amount(expenseFunding.rows[0]?.owner_paid);
  const unclassifiedOwnerPaidCount = expenseFunding.rows[0]?.unclassified_count ?? 0;
  const unclassifiedOwnerPaidMinor = amount(expenseFunding.rows[0]?.unclassified_minor);
  const categoryCount = expenseFunding.rows[0]?.category_count ?? 0;
  const ownerPaidClassificationStatus =
    categoryCount === 0
      ? ("unconfigured" as const)
      : unclassifiedOwnerPaidCount > 0
        ? ("review_required" as const)
        : ("ready" as const);
  const config = readiness.rows[0];
  const configurationWarnings: string[] =
    config?.operating_mode === "solopreneur"
      ? [
          ...(config.approved_statement_mapping_count === 0
            ? [
                config.effective_statement_mapping_count > 0
                  ? "financial_statement_mapping_unapproved"
                  : "financial_statement_mapping_missing",
              ]
            : []),
          ...(config.approved_executive_policy_count === 0
            ? [
                config.effective_executive_policy_count > 0
                  ? "executive_metric_policy_unapproved"
                  : "executive_metric_policy_missing",
              ]
            : []),
        ]
      : [];
  if (companyCashOnHandMinor < 0n) configurationWarnings.push("shared_cash_ledger_unreconciled");
  if (ownerCashCustodyMinor < 0n) configurationWarnings.push("owner_custody_negative");
  if (hasUnmigratedCustodyEntries)
    configurationWarnings.push("owner_custody_ledger_migration_required");
  // Foreign-currency items are excluded from base-currency totals; tell the user so the omission
  // is never silent.
  const foreign = await this.pool.query<{ count: number }>(
    `select (
       (select count(*) from journal_entries where organization_id=$1 and state in ('posted','reversed')
          and currency<>$4 and journal_date between $2::date and $3::date)
       + (select count(*) from commercial_documents where organization_id=$1
            and state in ('issued','posted','partially_paid','paid')
            and currency<>$4 and document_date between $2::date and $3::date)
     )::int count`,
    [org, q.startsOn, q.endsOn, baseCurrency],
  );
  if ((foreign.rows[0]?.count ?? 0) > 0)
    configurationWarnings.push("foreign_currency_excluded_from_totals");
  const paymentGaps = await summarizePaymentEvidenceGaps(this.pool, org, q.startsOn, q.endsOn);
  if (paymentGaps.summary.lineCount > 0) configurationWarnings.push("payment_evidence_missing");
  const citIneligible = amount(expenseFunding.rows[0]?.cit_ineligible);
  const citEstimate = await resolvePgCitEstimate(this.pool, org, {
    startsOn: q.startsOn,
    endsOn: q.endsOn,
    asOf: q.asOf,
    baseCurrency,
    accountingRevenueMinor: revenue,
    accountingExpenseMinor: expense,
    citIneligibleMinor: citIneligible,
    citUnreviewedMinor: 0n,
  });
  if (config?.operating_mode === "solopreneur" && citEstimate.effectiveRateBps === null) {
    configurationWarnings.push(
      config.effective_cit_policy_count > 0 ? "cit_policy_unapproved" : "cit_policy_missing",
    );
  }
  return {
    revenueMinor: revenue.toString(),
    expenseMinor: expense.toString(),
    netProfitMinor: netProfit.toString(),
    unrestrictedCashMinor: cash.rows[0]?.amount ?? null,
    bankAvailableMinor: bankAvailableMinor.toString(),
    cashOnHandMinor: cashOnHandMinor.toString(),
    companyCashOnHandMinor: companyCashOnHandMinor.toString(),
    cashAndBankMinor: cashAndBankMinor.toString(),
    totalCompanyFundsMinor: companyFunds.totalMinor.toString(),
    companyFundsReconciliationGapMinor: companyFunds.reconciliationGapMinor.toString(),
    ownerPayableMinor: companyOwesOwnerMinor.toString(),
    statutoryOwnerCurrentBalanceMinor: ownerPayableMinor.toString(),
    ownerOperatingPayableMinor: companyOwesOwnerMinor.toString(),
    confirmedOwnerSettlementMinor: confirmedOwnerSettlementMinor.toString(),
    ownerHoldsCompanyFundsMinor: ownerHoldsCompanyFundsMinor.toString(),
    ownerSettlementDrilldownHref: "/banking/owner-current",
    ownerCashCustodyMinor: ownerCashCustodyMinor.toString(),
    ownerReceivableMinor: ownerReceivableMinor.toString(),
    netOwnerPositionMinor: netOwnerPositionMinor.toString(),
    negativeOwnerCustodyAlert: buildNegativeCustodyAlert(ownerCashCustodyMinor),
    ownerPersonalWithdrawalMinor: "0",
    netAvailableCashMinor: (cashAndBankMinor - companyOwesOwnerMinor).toString(),
    actualOwnerPaidCompanyCostMinor: actualOwnerPaidCompanyCostMinor.toString(),
    netCompanyFundsMinor: (cashAndBankMinor - companyOwesOwnerMinor).toString(),
    unclassifiedOwnerPaidCount,
    unclassifiedOwnerPaidMinor: unclassifiedOwnerPaidMinor.toString(),
    ownerPaidClassificationStatus,
    corporateIncomeTaxRateBps: citEstimate.effectiveRateBps,
    taxableProfitMinor: citEstimate.taxableProfitMinor,
    corporateIncomeTaxMinor: citEstimate.estimatedCitMinor,
    corporateIncomeTaxTierCode: citEstimate.tierCode,
    corporateIncomeTaxBasis: citEstimate.basis,
    corporateIncomeTaxAssumption: citEstimate.assumption,
    priorYearRevenueMinor: citEstimate.referenceRevenueMinor,
    citSmallEnterpriseIneligible: citEstimate.citSmallEnterpriseIneligible,
    rosBps: ratioBps(netProfit, revenue),
    recognitionEventCount: readiness.rows[0]?.recognition_count ?? 0,
    approvedBudgetCount: readiness.rows[0]?.budget_count ?? 0,
    paymentEvidenceGaps: paymentGaps.summary,
    configurationWarnings,
    source: "posted_ledger" as const,
    monthly,
  };
}
