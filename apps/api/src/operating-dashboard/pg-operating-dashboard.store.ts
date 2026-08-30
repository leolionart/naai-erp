import { Inject, Injectable } from "@nestjs/common";
import pg from "pg";
import { AGING_STORE, type AgingStore } from "../aging/aging.types.js";
import type {
  OperatingDashboardQuery,
  OperatingDashboardReadModel,
  OperatingDashboardStore,
  WorkbookSourceControlKind,
  WorkbookSourceControls,
} from "./operating-dashboard.types.js";

const amount = (value: unknown) => BigInt(String(value ?? 0));
const ratioBps = (part: bigint, total: bigint) =>
  total > 0n ? Number((part * 10_000n + total / 2n) / total) : null;
const controlKinds: readonly WorkbookSourceControlKind[] = [
  "bonus_control",
  "debt_control",
  "expense_category_control",
  "payroll_master",
  "planning_control",
  "profitability_control",
];
const controlMoney = (value: unknown) =>
  typeof value === "string" && /^-?\d+$/.test(value) ? value : "0";
const controlText = (value: unknown) => (typeof value === "string" ? value : "");
const controlPeriod = (value: unknown) =>
  typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : undefined;

@Injectable()
export class PgOperatingDashboardStore implements OperatingDashboardStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  constructor(@Inject(AGING_STORE) private readonly aging: AgingStore) {}

  async read(org: string, q: OperatingDashboardQuery): Promise<OperatingDashboardReadModel> {
    const organization = await this.pool.query<{ base_currency: string }>(
      "select base_currency from organizations where id=$1",
      [org],
    );
    if (!organization.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    const [projects, clients, quality, sourceControls, aging, financials] = await Promise.all([
      this.projects(org, q),
      this.clients(org, q),
      this.quality(org, q.limit),
      this.sourceControls(org, q),
      this.aging.report(org, "ar", { asOf: q.asOf, limit: 100, includeSettled: false }),
      this.financials(org, q),
    ]);
    const contracted = projects.reduce((sum, row) => sum + amount(row.contractedMinor), 0n);
    const invoiced = projects.reduce((sum, row) => sum + amount(row.invoicedMinor), 0n);
    const totalRevenue = clients.reduce((sum, row) => sum + amount(row.revenueMinor), 0n);
    const clientRows = clients.map((row) => ({
      ...row,
      shareBps: ratioBps(amount(row.revenueMinor), totalRevenue),
    }));
    const ar = amount(aging.outstandingTotalMinor);
    const creditSales = await this.creditSales(org, q.asOf);
    const overdue = aging.items
      .filter((item) => item.bucket !== "current")
      .reduce((sum, item) => sum + amount(item.outstandingMinor), 0n);
    const overdueCount = aging.items.filter((item) => item.bucket !== "current").length;
    const projectRows = projects.map((p) => ({
      ...p,
      invoicedProgressBps:
        amount(p.contractedMinor) > 0n
          ? Number((amount(p.invoicedMinor) * 10_000n) / amount(p.contractedMinor))
          : 0,
    }));
    const pipeline = projectRows
      .filter(
        (p) =>
          amount((p as Record<string, unknown>).contractedMinor) !== 0n ||
          amount((p as Record<string, unknown>).invoicedMinor) !== 0n ||
          amount((p as Record<string, unknown>).backlogMinor) !== 0n,
      )
      .sort((a, b) =>
        Number(
          amount((b as Record<string, unknown>).invoicedMinor) +
            amount((b as Record<string, unknown>).backlogMinor) -
            amount((a as Record<string, unknown>).invoicedMinor) -
            amount((a as Record<string, unknown>).backlogMinor),
        ),
      )
      .slice(0, 6);
    const highlights = [...projectRows]
      .sort((a, b) =>
        Number(
          amount((b as Record<string, unknown>).contractedMinor) -
            amount((a as Record<string, unknown>).contractedMinor),
        ),
      )
      .slice(0, 3);
    const asOfMs = Date.parse(`${q.asOf}T00:00:00Z`);
    let due7 = 0n,
      due30 = 0n,
      later = 0n;
    for (const item of aging.items.filter((candidate) => candidate.bucket === "current")) {
      const days = item.dueDate
        ? Math.ceil((Date.parse(`${item.dueDate}T00:00:00Z`) - asOfMs) / 86_400_000)
        : 31;
      if (days <= 7) due7 += amount(item.outstandingMinor);
      else if (days <= 30) due30 += amount(item.outstandingMinor);
      else later += amount(item.outstandingMinor);
    }
    return {
      schemaVersion: 1,
      asOf: q.asOf,
      currency: organization.rows[0].base_currency,
      backlog: {
        projectCount: projects.length,
        contractedMinor: contracted.toString(),
        invoicedMinor: invoiced.toString(),
        remainingMinor: (contracted > invoiced ? contracted - invoiced : 0n).toString(),
        portfolioProgressBps: contracted > 0n ? Number((invoiced * 10_000n) / contracted) : 0,
        projects: projectRows.slice(0, q.limit),
        projectPipeline: pipeline,
        projectHighlights: highlights,
      },
      collections: {
        receivablesMinor: ar.toString(),
        creditSalesMinor: creditSales.toString(),
        dsoDays: creditSales > 0n ? Number((ar * 90n + creditSales / 2n) / creditSales) : null,
        overdueMinor: overdue.toString(),
        dueWithin7DaysMinor: due7.toString(),
        dueWithin30DaysMinor: due30.toString(),
        laterMinor: later.toString(),
        overdueCount,
      },
      projectBurn: projects.slice(0, q.limit),
      clientConcentration: {
        totalRevenueMinor: totalRevenue.toString(),
        topClientShareBps: ratioBps(amount(clients[0]?.revenueMinor), totalRevenue),
        topThreeShareBps: ratioBps(
          clients.slice(0, 3).reduce((sum, row) => sum + amount(row.revenueMinor), 0n),
          totalRevenue,
        ),
        clients: clientRows.slice(0, q.limit),
      },
      financials,
      dataQuality: quality,
      sourceControls,
    };
  }

  private async financials(org: string, q: OperatingDashboardQuery) {
    const [
      monthlyResult,
      cash,
      cashAndBank,
      ownerCurrent,
      ownerSettlement,
      expenseFunding,
      taxPolicy,
      readiness,
    ] = await Promise.all([
      this.pool.query<{ period: string; revenue: string; expense: string }>(
        `select
           to_char(j.journal_date, 'YYYY-MM') period,
           coalesce(sum(coalesce(l.credit_minor,0)-coalesce(l.debit_minor,0)) filter (where a.root_type='revenue'),0)::text revenue,
           coalesce(sum(coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0)) filter (where a.root_type='expense'),0)::text expense
         from journal_entries j
         join journal_lines l on l.organization_id=j.organization_id and l.journal_id=j.id
         join accounts a on a.organization_id=l.organization_id and a.code=l.account_code
        where j.organization_id=$1 and j.state in ('posted','reversed')
          and j.journal_date between $2::date and $3::date
        group by to_char(j.journal_date, 'YYYY-MM')
        order by to_char(j.journal_date, 'YYYY-MM')`,
        [org, q.startsOn, q.endsOn],
      ),
      this.pool.query<{ amount: string | null }>(
        `with workflow_policy as (
           select operating_mode from accounting_workflow_policies where organization_id=$1
         ), selected_policy as (
           select * from executive_metric_policy_versions
           where organization_id=$1 and (state='approved' or coalesce((select operating_mode from workflow_policy),'controlled')='solopreneur')
             and effective_from<=$2::date and (effective_to is null or effective_to>=$2::date)
           order by (state='approved') desc,effective_from desc,version desc limit 1
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
      this.pool.query<{ bank_amount: string; cash_amount: string; amount: string }>(
        `with cash_accounts as (
           select distinct ledger_account_code account_code,kind,code
           from financial_accounts
           where organization_id=$1 and status='active' and kind in ('bank','cash')
         )
         select
           coalesce(sum(coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0)) filter (where ca.kind='bank'),0)::text bank_amount,
           coalesce(sum(coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0)) filter (where ca.kind='cash' and not exists (select 1 from financial_accounts x where x.organization_id=$1 and x.code='CASH-OWNER-CUSTODY' and x.ledger_account_code=ca.account_code)),0)::text cash_amount,
           coalesce(sum(coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0)) filter (where ca.kind='bank' or (ca.kind='cash' and not exists (select 1 from financial_accounts x where x.organization_id=$1 and x.code='CASH-OWNER-CUSTODY' and x.ledger_account_code=ca.account_code))),0)::text amount
         from cash_accounts ca
         join journal_lines l on l.organization_id=$1 and l.account_code=ca.account_code
         join journal_entries j on j.organization_id=l.organization_id and j.id=l.journal_id
         where j.state in ('posted','reversed') and j.journal_date<=$2::date`,
        [org, q.asOf],
      ),
      this.pool.query<{ amount: string }>(
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
         select coalesce(sum(coalesce(l.credit_minor,0)-coalesce(l.debit_minor,0)),0)::text amount
         from owner_accounts oa
         join journal_lines l on l.organization_id=$1 and l.account_code=oa.account_code
         join journal_entries j on j.organization_id=l.organization_id and j.id=l.journal_id
         where j.state in ('posted','reversed') and j.journal_date<=$2::date`,
        [org, q.asOf],
      ),
      this.pool.query<{
        settlement: string;
        company_owes_owner: string;
        owner_holds_company_funds: string;
        custody: string;
        personal_withdrawals: string;
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
             /*
              * Costs paid directly from the owner's custody cash reduce the
              * amount of company money still held by the owner.  These are
              * canonical posted expenses whose counter account is the ledger
              * account backing CASH-OWNER-CUSTODY (typically cash/111), and
              * therefore do not require a synthetic transfer record.
              */
             select coalesce(sum(e.gross_minor),0) amount
             from expenses e
             join journal_entries j on j.organization_id=e.organization_id and j.id=e.journal_id
             join financial_accounts fa on fa.organization_id=e.organization_id
               and fa.code='CASH-OWNER-CUSTODY'
             where e.organization_id=$1 and e.state='posted'
               and j.state in ('posted','reversed')
               and e.expense_date<=$2::date
               and e.counter_account_code=fa.ledger_account_code
           ), custody_purchase_invoices as (
             /*
              * Purchase invoices are a canonical spend source and do not
              * necessarily have a row in expenses. When their reviewed
              * funding account is CASH-OWNER-CUSTODY, the invoice itself
              * consumes the owner-held company cash.  Include only
              * progressed, non-cancelled invoices and use the document date
              * for the dashboard cutoff.
              */
             select coalesce(sum(d.gross_minor),0) amount
             from commercial_documents d
             join financial_accounts fa on fa.organization_id=d.organization_id
               and fa.id=d.funding_financial_account_id
               and fa.code='CASH-OWNER-CUSTODY'
             where d.organization_id=$1 and d.type='purchase_invoice'
               and d.state in ('posted','partially_paid','paid')
               and d.document_date<=$2::date
           ), custody as (
             select greatest((select amount from custody_incoming)
               - (select amount from custody_expenses)
               - (select amount from custody_purchase_invoices)
               - (select coalesce(sum(l.gross_minor),0) from expenses e
                   join expense_lines l on l.organization_id=e.organization_id and l.expense_id=e.id
                   join journal_entries j on j.organization_id=e.organization_id and j.id=e.journal_id
                  where e.organization_id=$1 and e.state='posted' and j.state in ('posted','reversed')
                    and e.expense_date<=$2::date
                    and l.funding_treatment='owner_paid_company_cost'
                    and e.funding_financial_account_id=(select id from financial_accounts where organization_id=$1 and code='CASH-OWNER-CUSTODY')),0) amount
           ), custody_transfers as (
             select (select amount from custody_incoming) amount
           ), company_repayments as (
             select coalesce(sum(-owner_delta),0) amount
             from (
               select j.id,
                 sum(case when l.account_code in (select account_code from owner_accounts)
                   then coalesce(l.credit_minor,0)-coalesce(l.debit_minor,0) else 0 end) owner_delta,
                 sum(case when l.account_code in (select ledger_account_code from financial_accounts
                     where organization_id=$1 and kind in ('bank','cash'))
                   then coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0) else 0 end) company_delta
               from journal_entries j
               join journal_lines l on l.organization_id=j.organization_id and l.journal_id=j.id
               where j.organization_id=$1 and j.state in ('posted','reversed') and j.journal_date<=$2::date
               group by j.id
             ) movements
             where owner_delta < 0 and company_delta < 0
               and not exists (
                 select 1
                 from internal_transfers it
                 join internal_transfer_attempts ita on ita.organization_id=it.organization_id
                   and ita.transfer_id=it.id and ita.attempt_number=it.current_attempt_number
                   and ita.state='reconciled'
                 join bank_transactions outgoing on outgoing.organization_id=ita.organization_id
                   and outgoing.id=ita.outgoing_transaction_id
                 where it.organization_id=$1
                   and it.transfer_amount_minor=(-owner_delta)
               )
           ), totals as (
             select (select amount from eligible_owner_expenses)
               - (select amount from custody_transfers)
               - (select amount from company_repayments) settlement
           )
           select settlement::text,
             greatest(settlement,0)::text company_owes_owner,
             greatest(-settlement,0)::text owner_holds_company_funds,
             (select amount from custody)::text custody,
             (select amount from company_repayments)::text personal_withdrawals
           from totals`,
        [org, q.asOf],
      ),
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
             (coalesce(sum(l.net_minor) filter (where l.cit_state='ineligible' and j.state in ('posted','reversed')),0) + coalesce((select sum(cl.net_minor) from commercial_document_lines cl join commercial_documents cd on cd.organization_id=cl.organization_id and cd.id=cl.document_id where cl.organization_id=$1 and cl.cit_state='ineligible' and cd.type='purchase_invoice' and cd.state in ('issued','posted','partially_paid','paid') and cd.document_date between $2::date and $3::date),0))::text cit_ineligible,
             (select count(*)::int from expense_categories c where c.organization_id=$1 and c.is_active=true) category_count
           from expenses e
           join expense_lines l on l.organization_id=e.organization_id and l.expense_id=e.id
           left join expense_categories c on c.organization_id=l.organization_id and c.code=l.expense_category_code
           join journal_entries j on j.organization_id=e.organization_id and j.id=e.journal_id
           where e.organization_id=$1 and e.state='posted' and e.expense_date between $2::date and $3::date
             and j.state in ('posted','reversed')`,
        [org, q.startsOn, q.asOf],
      ),
      this.pool.query<{ rate_bps: number | null }>(
        `with workflow_policy as (select operating_mode from accounting_workflow_policies where organization_id=$1)
         select round(rate*10000)::int rate_bps
         from tax_code_versions
         where organization_id=$1 and kind='cit' and (review_state='accountant_approved' or coalesce((select operating_mode from workflow_policy),'controlled')='solopreneur')
           and effective_from<=$2::date and (effective_to is null or effective_to>=$2::date)
         order by (review_state='accountant_approved') desc,effective_from desc,code limit 1`,
        [org, q.asOf],
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
    const ownerCustodyMinor = amount(ownerSettlement.rows[0]?.custody);
    // Custody cash remains company cash; it is only held outside the company
    // bank/company-cash account. Include it in total company funds while
    // keeping bank availability separate.
    const cashAndBankMinor = amount(cashAndBank.rows[0]?.amount) + ownerCustodyMinor;
    const bankAvailableMinor = amount(cashAndBank.rows[0]?.bank_amount);
    const cashOnHandMinor = amount(cashAndBank.rows[0]?.cash_amount) + ownerCustodyMinor;
    const ownerCurrentMinor = amount(ownerCurrent.rows[0]?.amount);
    const ownerPayableMinor = ownerCurrentMinor > 0n ? ownerCurrentMinor : 0n;
    const confirmedOwnerSettlementMinor = amount(ownerSettlement.rows[0]?.settlement);
    const companyOwesOwnerMinor = amount(ownerSettlement.rows[0]?.company_owes_owner);
    const ownerHoldsCompanyFundsMinor = amount(ownerSettlement.rows[0]?.owner_holds_company_funds);
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
    const configurationWarnings =
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
            ...(config.approved_cit_policy_count === 0
              ? [
                  config.effective_cit_policy_count > 0
                    ? "cit_policy_unapproved"
                    : "cit_policy_missing",
                ]
              : []),
          ]
        : [];
    const citIneligible = amount(expenseFunding.rows[0]?.cit_ineligible);
    const taxableProfit = netProfit + citIneligible;
    // Preserve the signed taxable result for reporting.  Only the CIT tax
    // base is floored at zero; a loss must remain visible to users.
    const taxableProfitMinor = taxableProfit.toString();
    const taxableBaseMinor = taxableProfit > 0n ? taxableProfit : 0n;
    const corporateIncomeTaxMinor =
      taxPolicy.rows[0]?.rate_bps == null
        ? null
        : ((taxableBaseMinor * BigInt(taxPolicy.rows[0].rate_bps)) / 10_000n).toString();
    return {
      revenueMinor: revenue.toString(),
      expenseMinor: expense.toString(),
      netProfitMinor: netProfit.toString(),
      unrestrictedCashMinor: cash.rows[0]?.amount ?? null,
      bankAvailableMinor: bankAvailableMinor.toString(),
      cashOnHandMinor: cashOnHandMinor.toString(),
      cashAndBankMinor: cashAndBankMinor.toString(),
      ownerPayableMinor: companyOwesOwnerMinor.toString(),
      statutoryOwnerCurrentBalanceMinor: ownerPayableMinor.toString(),
      ownerOperatingPayableMinor: companyOwesOwnerMinor.toString(),
      confirmedOwnerSettlementMinor: confirmedOwnerSettlementMinor.toString(),
      ownerHoldsCompanyFundsMinor: ownerHoldsCompanyFundsMinor.toString(),
      ownerSettlementDrilldownHref: "/banking/owner-current",
      ownerCashCustodyMinor: ownerCustodyMinor.toString(),
      ownerPersonalWithdrawalMinor: amount(
        ownerSettlement.rows[0]?.personal_withdrawals,
      ).toString(),
      netAvailableCashMinor: (cashAndBankMinor - companyOwesOwnerMinor).toString(),
      actualOwnerPaidCompanyCostMinor: actualOwnerPaidCompanyCostMinor.toString(),
      netCompanyFundsMinor: (cashAndBankMinor - companyOwesOwnerMinor).toString(),
      unclassifiedOwnerPaidCount,
      unclassifiedOwnerPaidMinor: unclassifiedOwnerPaidMinor.toString(),
      ownerPaidClassificationStatus,
      corporateIncomeTaxRateBps: taxPolicy.rows[0]?.rate_bps ?? null,
      taxableProfitMinor,
      corporateIncomeTaxMinor,
      rosBps: ratioBps(netProfit, revenue),
      recognitionEventCount: readiness.rows[0]?.recognition_count ?? 0,
      approvedBudgetCount: readiness.rows[0]?.budget_count ?? 0,
      configurationWarnings,
      source: "posted_ledger" as const,
      monthly,
    };
  }

  private async projects(org: string, q: OperatingDashboardQuery) {
    return (
      await this.pool.query<Record<string, unknown>>(
        `select p.id "projectId",p.code,p.name,pa.display_name "clientName",p.state,p.starts_on::text "startsOn",p.ends_on::text "endsOn",
        coalesce(c.amount,p.budget_minor)::text "contractedMinor",coalesce(r.amount,0)::text "recognizedMinor",coalesce(i.amount,0)::text "invoicedMinor",coalesce(col.amount,0)::text "collectedMinor",coalesce(e.amount,0)::text "actualCostMinor",
        greatest(coalesce(c.amount,p.budget_minor)-coalesce(i.amount,0),0)::text "backlogMinor",
        coalesce(b.direct_cost_total_minor,0)::text "budgetCostMinor",
        case when coalesce(b.direct_cost_total_minor,0)>0 then round(coalesce(e.amount,0)*10000.0/b.direct_cost_total_minor)::int else null end "burnBps",
        case when p.state='completed' then coalesce(e.amount,0)::text else greatest(coalesce(e.amount,0),coalesce(b.direct_cost_total_minor,0))::text end "estimateAtCompletionMinor",
        case when b.id is null then 'project-budget-fallback' else 'approved-direct-cost-budget' end "eacMethod"
       from projects p join parties pa on pa.organization_id=p.organization_id and pa.id=p.client_party_id
       left join lateral (select sum(amount) amount from (
         select value_minor amount from contracts where organization_id=p.organization_id and project_id=p.id and currency=p.currency and signed_on<=$4::date
         union all
         select expected_revenue_impact_minor from scope_changes where organization_id=p.organization_id and project_id=p.id and state='approved' and approved_at::date<=$4::date
       ) contracted) c on true
       left join lateral (select coalesce(sum(amount_minor),0) amount from revenue_recognition_events where organization_id=p.organization_id and project_id=p.id and state='posted' and effective_on<=$4::date) r on true
       left join lateral (select sum(case when d.type='credit_note' then -x.amount else x.amount end) amount
         from commercial_documents d join lateral (
           select coalesce(sum(source.amount),0) amount from (
             select a.amount_minor amount from commercial_document_allocations a where a.organization_id=d.organization_id and a.document_id=d.id and a.dimensions->>'projectId'=p.id
             union all
             select l.net_minor from commercial_document_lines l where l.organization_id=d.organization_id and l.document_id=d.id and l.dimensions->>'projectId'=p.id and not exists(select 1 from commercial_document_allocations a where a.organization_id=l.organization_id and a.document_id=l.document_id and a.line_number=l.line_number)
           ) source
         ) x on x.amount<>0
        where d.organization_id=p.organization_id and d.currency=p.currency and d.type in('sales_invoice','credit_note') and d.state in ('issued','posted','partially_paid','paid') and d.document_date<=$4::date) i on true
       left join lateral (select coalesce(round(sum(payment.amount_minor*project_share.amount/nullif(d.gross_minor,0))),0)::bigint amount
         from commercial_documents d
         join lateral (
           select coalesce(sum(source.amount),0) amount from (
             select a.amount_minor amount from commercial_document_allocations a where a.organization_id=d.organization_id and a.document_id=d.id and a.dimensions->>'projectId'=p.id
             union all
             select l.net_minor from commercial_document_lines l where l.organization_id=d.organization_id and l.document_id=d.id and l.dimensions->>'projectId'=p.id and not exists(select 1 from commercial_document_allocations a where a.organization_id=l.organization_id and a.document_id=l.document_id and a.line_number=l.line_number)
           ) source
         ) project_share on project_share.amount<>0
         join lateral (
           select coalesce(sum(receipt.amount_minor),0) amount_minor from (
             select a.target_amount_minor amount_minor from reconciliation_allocations a join reconciliation_attempts r on r.organization_id=a.organization_id and r.id=a.reconciliation_id where a.organization_id=d.organization_id and a.commercial_document_id=d.id and r.state='reconciled' and r.reconciled_at::date<=$4::date
             union all
             select a.amount_minor from customer_receipt_allocations a join customer_receipts r on r.organization_id=a.organization_id and r.id=a.receipt_id where a.organization_id=d.organization_id and a.sales_invoice_id=d.id and r.state='posted' and r.receipt_date<=$4::date
           ) receipt
         ) payment on payment.amount_minor>0
        where d.organization_id=p.organization_id and d.currency=p.currency and d.type='sales_invoice' and d.state in ('issued','posted','partially_paid','paid') and d.document_date<=$4::date) col on true
       left join lateral (select sum(a.amount_minor) amount from expense_allocations a join expenses x on x.organization_id=a.organization_id and x.id=a.expense_id where a.organization_id=p.organization_id and a.dimensions->>'projectId'=p.id and x.state='posted' and x.expense_date<=$4::date) e on true
       left join lateral (select id,direct_cost_total_minor from project_budget_versions where organization_id=p.organization_id and project_id=p.id and (state='approved' or exists (select 1 from accounting_workflow_policies w where w.organization_id=p.organization_id and w.operating_mode='solopreneur')) order by (state='approved') desc,version_number desc limit 1) b on true
       where p.organization_id=$1 and p.starts_on<=$2 and (p.ends_on is null or p.ends_on>=$3)
       order by greatest(coalesce(c.amount,p.budget_minor)-coalesce(i.amount,0),0) desc,p.id`,
        [org, q.endsOn, q.startsOn, q.asOf],
      )
    ).rows;
  }

  private async clients(org: string, q: OperatingDashboardQuery) {
    return (
      await this.pool.query<Record<string, unknown>>(
        `select d.party_id "clientId",p.display_name "clientName",sum(d.net_minor)::text "revenueMinor",count(*)::int "invoiceCount"
       from commercial_documents d join parties p on p.organization_id=d.organization_id and p.id=d.party_id
       where d.organization_id=$1 and d.type='sales_invoice' and d.state in ('issued','posted','partially_paid','paid') and d.document_date between $2 and least($3::date,$4::date)
       group by d.party_id,p.display_name order by sum(d.net_minor) desc,d.party_id`,
        [org, q.startsOn, q.endsOn, q.asOf],
      )
    ).rows;
  }

  private async creditSales(org: string, asOf: string) {
    const result = await this.pool.query<{ amount: string }>(
      `select coalesce(sum(net_minor),0)::text amount from commercial_documents where organization_id=$1 and type='sales_invoice' and state in ('issued','posted','partially_paid','paid') and document_date between ($2::date-89) and $2`,
      [org, asOf],
    );
    return amount(result.rows[0]?.amount);
  }

  private async quality(org: string, limit: number) {
    const [count, flags, rows, inferred] = await Promise.all([
      this.pool.query<{ count: number }>(
        `select count(*)::int count from workbook_import_review_rows where organization_id=$1 and status='pending_review'`,
        [org],
      ),
      this.pool.query<{ flag: string; count: number }>(
        `select flag,count(*)::int count from workbook_import_review_rows cross join lateral jsonb_array_elements_text(review_flags) flag where organization_id=$1 and status='pending_review' group by flag order by count(*) desc,flag`,
        [org],
      ),
      this.pool.query<Record<string, unknown>>(
        `select id,kind,workbook,sheet,source_row "sourceRow",review_flags "reviewFlags",mapped_data "mappedData",version::text from workbook_import_review_rows where organization_id=$1 and status='pending_review' order by updated_at desc,id limit $2`,
        [org, limit],
      ),
      this.pool.query<Record<string, unknown>>(
        `select e.id "expenseId",e.expense_date::text "expenseDate",e.gross_minor::text "grossMinor",
                e.counter_account_code "counterAccountCode",l.expense_category_code "categoryCode",
                coalesce(l.funding_treatment,c.funding_treatment) "fundingTreatment",
                case
                  when coalesce(l.funding_treatment,c.funding_treatment)='owner_paid_company_cost'
                    and e.counter_account_code in (select ledger_account_code from financial_accounts where organization_id=$1 and kind in ('bank','cash'))
                    then 'funding_source_mismatch'
                  when coalesce(l.funding_treatment,c.funding_treatment)='tax_only_non_cash'
                    and e.counter_account_code in (select ledger_account_code from financial_accounts where organization_id=$1 and kind in ('bank','cash'))
                    then 'non_cash_funding_mismatch'
                  when l.cit_state='ineligible' and l.cit_eligible_minor=0
                    and l.expense_category_code in ('SALARY','PAYROLL','ELECTRONIC_EQUIP','SERVER_CLOUD','VEHICLE_RENTAL')
                    then 'cit_review_recommended'
                  else null
                end "inferredFlag"
           from expenses e
           join expense_lines l on l.organization_id=e.organization_id and l.expense_id=e.id
           left join expense_categories c on c.organization_id=l.organization_id and c.code=l.expense_category_code
          where e.organization_id=$1 and e.state='posted'
            and (
              (coalesce(l.funding_treatment,c.funding_treatment) in ('owner_paid_company_cost','tax_only_non_cash')
               and e.counter_account_code in (select ledger_account_code from financial_accounts where organization_id=$1 and kind in ('bank','cash')))
              or (l.cit_state='ineligible' and l.cit_eligible_minor=0 and l.expense_category_code in ('SALARY','PAYROLL','ELECTRONIC_EQUIP','SERVER_CLOUD','VEHICLE_RENTAL'))
            )
          order by e.expense_date,e.id,l.line_number limit $2`,
        [org, limit],
      ),
    ]);
    const inferredRows = inferred.rows.filter((row) => row.inferredFlag);
    const inferredByFlag = inferredRows.reduce<{ flag: string; count: number }[]>((acc, row) => {
      const flag = String(row.inferredFlag);
      const existing = acc.find((item) => item.flag === flag);
      if (existing) existing.count += 1;
      else acc.push({ flag, count: 1 });
      return acc;
    }, []);
    return {
      pendingCount: count.rows[0]?.count ?? 0,
      byFlag: flags.rows,
      rows: rows.rows,
      flaggedCount: flags.rows.reduce((sum, row) => sum + row.count, 0),
      inferredCount: inferredRows.length,
      inferredByFlag,
      inferredRows,
    };
  }

  private async sourceControls(
    org: string,
    q: OperatingDashboardQuery,
  ): Promise<WorkbookSourceControls> {
    type SourceRow = {
      id: string;
      kind: WorkbookSourceControlKind;
      workbook: string;
      sheet: string;
      sourceRow: number;
      status: "pending_review" | "approved" | "posted";
      reviewFlags: string[];
      mappedData: Record<string, unknown>;
    };
    const result = await this.pool.query<SourceRow>(
      `select id,kind,workbook,sheet,source_row "sourceRow",status,
              review_flags "reviewFlags",mapped_data "mappedData"
         from workbook_import_review_rows
        where organization_id=$1 and kind=any($2::text[]) and status<>'ignored'
          and (
            (mapped_data->>'period' is not null and mapped_data->>'period' >= substring($3::text from 1 for 7) and mapped_data->>'period' <= substring($4::text from 1 for 7))
            or (kind = 'expense_category_control' and exists (
               select 1 from jsonb_array_elements(mapped_data->'monthlyAmounts') as a
               where a->>'period' >= substring($3::text from 1 for 7) and a->>'period' <= substring($4::text from 1 for 7)
            ))
            or kind in ('payroll_master', 'bonus_control')
          )
        order by kind,coalesce(mapped_data->>'period',''),source_row,id`,
      [org, controlKinds, q.startsOn, q.endsOn],
    );
    const byKind = controlKinds
      .map((kind) => ({ kind, count: result.rows.filter((row) => row.kind === kind).length }))
      .filter((item) => item.count > 0);
    const monthly = result.rows
      .filter(
        (row): row is SourceRow & { kind: "profitability_control" | "planning_control" } =>
          row.kind === "profitability_control" || row.kind === "planning_control",
      )
      .flatMap((row) => {
        const period = controlPeriod(row.mappedData.period);
        if (!period) return [];
        return [
          {
            id: row.id,
            kind: row.kind,
            period,
            revenueMinor: controlMoney(row.mappedData.revenueMinor),
            receivedMinor: controlMoney(row.mappedData.receivedMinor),
            expenseMinor: controlMoney(row.mappedData.expenseMinor),
            profitMinor: controlMoney(row.mappedData.profitMinor),
            ...(row.kind === "planning_control"
              ? {
                  targetAttainmentBps:
                    typeof row.mappedData.targetAttainmentBps === "number"
                      ? row.mappedData.targetAttainmentBps
                      : null,
                  forecastExpenseMinor:
                    row.mappedData.forecastExpenseMinor === null
                      ? null
                      : controlMoney(row.mappedData.forecastExpenseMinor),
                  forecastCashMinor:
                    row.mappedData.forecastCashMinor === null
                      ? null
                      : controlMoney(row.mappedData.forecastCashMinor),
                }
              : {}),
            reviewFlags: row.reviewFlags,
          },
        ];
      })
      .sort(
        (left, right) =>
          left.period.localeCompare(right.period) || left.kind.localeCompare(right.kind),
      );
    const debt = result.rows
      .filter((row) => row.kind === "debt_control")
      .map((row) => ({
        id: row.id,
        ...(controlPeriod(row.mappedData.period)
          ? { period: controlPeriod(row.mappedData.period) }
          : {}),
        projectLabel: controlText(row.mappedData.projectLabel),
        debtMinor: controlMoney(row.mappedData.debtMinor),
        projectCostMinor: controlMoney(row.mappedData.projectCostMinor),
        collectedMinor:
          row.mappedData.collectedMinor === null
            ? null
            : controlMoney(row.mappedData.collectedMinor),
        reviewFlags: row.reviewFlags,
      }));
    const expenseCategories = result.rows
      .filter((row) => row.kind === "expense_category_control")
      .map((row) => ({
        id: row.id,
        category: controlText(row.mappedData.category),
        monthlyAmounts: Array.isArray(row.mappedData.monthlyAmounts)
          ? row.mappedData.monthlyAmounts.flatMap((item) => {
              if (!item || typeof item !== "object") return [];
              const value = item as Record<string, unknown>;
              const period = controlPeriod(value.period);
              return period ? [{ period, amountMinor: controlMoney(value.amountMinor) }] : [];
            })
          : [],
        reviewFlags: row.reviewFlags,
      }));
    return {
      source: "workbook_import_review_rows",
      accountingStatus: "unconfirmed_non_canonical",
      rowCount: result.rows.length,
      byKind,
      monthly,
      debt,
      expenseCategories,
      rows: result.rows.slice(0, q.limit),
    };
  }
}
