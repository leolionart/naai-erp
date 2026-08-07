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
    const ar = amount(aging.outstandingTotalMinor);
    const creditSales = await this.creditSales(org, q.asOf);
    const overdue = aging.items
      .filter((item) => item.bucket !== "current")
      .reduce((sum, item) => sum + amount(item.outstandingMinor), 0n);
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
        projects: projects.slice(0, q.limit),
      },
      collections: {
        receivablesMinor: ar.toString(),
        creditSalesMinor: creditSales.toString(),
        dsoDays: creditSales > 0n ? Number((ar * 90n + creditSales / 2n) / creditSales) : null,
        overdueMinor: overdue.toString(),
        dueWithin7DaysMinor: due7.toString(),
        dueWithin30DaysMinor: due30.toString(),
        laterMinor: later.toString(),
      },
      projectBurn: projects.slice(0, q.limit),
      clientConcentration: {
        totalRevenueMinor: totalRevenue.toString(),
        topClientShareBps: ratioBps(amount(clients[0]?.revenueMinor), totalRevenue),
        topThreeShareBps: ratioBps(
          clients.slice(0, 3).reduce((sum, row) => sum + amount(row.revenueMinor), 0n),
          totalRevenue,
        ),
        clients: clients.slice(0, q.limit),
      },
      financials,
      dataQuality: quality,
      sourceControls,
    };
  }

  private async financials(org: string, q: OperatingDashboardQuery) {
    const [monthlyResult, cash, cashAndBank, ownerCurrent, taxPolicy, readiness] =
      await Promise.all([
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
          `select sum(
           (case when a.root_type in ('liability','equity','revenue')
             then coalesce(l.credit_minor,0)-coalesce(l.debit_minor,0)
             else coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0) end) * m.sign
         )::text amount
         from executive_metric_policy_versions p
         join executive_metric_semantic_mappings m
           on m.organization_id=p.organization_id and m.policy_id=p.id and m.policy_version=p.version
         join accounts a on a.organization_id=m.organization_id and a.code=m.account_code
         join journal_lines l on l.organization_id=a.organization_id and l.account_code=a.code
         join journal_entries j on j.organization_id=l.organization_id and j.id=l.journal_id
        where p.organization_id=$1 and p.state='approved' and m.semantic='unrestricted_cash'
          and p.effective_from<=$2::date and (p.effective_to is null or p.effective_to>=$2::date)
          and j.state in ('posted','reversed') and j.journal_date<=$2::date`,
          [org, q.asOf],
        ),
        this.pool.query<{ bank_amount: string; cash_amount: string; amount: string }>(
          `with cash_accounts as (
           select distinct ledger_account_code account_code,kind
           from financial_accounts
           where organization_id=$1 and status='active' and kind in ('bank','cash')
         )
         select
           coalesce(sum(coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0)) filter (where ca.kind='bank'),0)::text bank_amount,
           coalesce(sum(coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0)) filter (where ca.kind='cash'),0)::text cash_amount,
           coalesce(sum(coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0)),0)::text amount
         from cash_accounts ca
         join journal_lines l on l.organization_id=$1 and l.account_code=ca.account_code
         join journal_entries j on j.organization_id=l.organization_id and j.id=l.journal_id
         where j.state in ('posted','reversed') and j.journal_date<=$2::date`,
          [org, q.asOf],
        ),
        this.pool.query<{ amount: string }>(
          `with selected_mapping as (
           select id,version
           from financial_statement_mapping_versions
           where organization_id=$1 and framework='TT133' and state='approved'
             and effective_from<=$2::date and (effective_to is null or effective_to>=$2::date)
           order by effective_from desc,version desc limit 1
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
        this.pool.query<{ rate_bps: number | null }>(
          `select round(rate*10000)::int rate_bps
         from tax_code_versions
         where organization_id=$1 and kind='cit' and review_state='accountant_approved'
           and effective_from<=$2::date and (effective_to is null or effective_to>=$2::date)
         order by effective_from desc,code limit 1`,
          [org, q.asOf],
        ),
        this.pool.query<{
          recognition_count: number;
          budget_count: number;
          overhead_count: number;
        }>(
          `select
          (select count(*)::int from revenue_recognition_events where organization_id=$1 and state='posted' and effective_on between $2::date and $3::date) recognition_count,
          (select count(*)::int from project_budget_versions where organization_id=$1 and state='approved') budget_count,
          (select count(*)::int from overhead_allocation_runs where organization_id=$1 and state='posted' and period_end>=$2::date and period_start<=$3::date) overhead_count`,
          [org, q.startsOn, q.endsOn],
        ),
      ]);
    const monthly = monthlyResult.rows.map((row) => ({
      period: row.period,
      revenueMinor: amount(row.revenue).toString(),
      expenseMinor: amount(row.expense).toString(),
    }));
    const revenue = monthlyResult.rows.reduce((sum, row) => sum + amount(row.revenue), 0n);
    const expense = monthlyResult.rows.reduce((sum, row) => sum + amount(row.expense), 0n);
    const netProfit = revenue - expense;
    const cashAndBankMinor = amount(cashAndBank.rows[0]?.amount);
    const bankAvailableMinor = amount(cashAndBank.rows[0]?.bank_amount);
    const cashOnHandMinor = amount(cashAndBank.rows[0]?.cash_amount);
    const ownerCurrentMinor = amount(ownerCurrent.rows[0]?.amount);
    const ownerPayableMinor = ownerCurrentMinor > 0n ? ownerCurrentMinor : 0n;
    return {
      revenueMinor: revenue.toString(),
      expenseMinor: expense.toString(),
      netProfitMinor: netProfit.toString(),
      unrestrictedCashMinor: cash.rows[0]?.amount ?? null,
      bankAvailableMinor: bankAvailableMinor.toString(),
      cashOnHandMinor: cashOnHandMinor.toString(),
      cashAndBankMinor: cashAndBankMinor.toString(),
      ownerPayableMinor: ownerPayableMinor.toString(),
      netAvailableCashMinor: (cashAndBankMinor - ownerPayableMinor).toString(),
      corporateIncomeTaxRateBps: taxPolicy.rows[0]?.rate_bps ?? null,
      rosBps: ratioBps(netProfit, revenue),
      recognitionEventCount: readiness.rows[0]?.recognition_count ?? 0,
      approvedBudgetCount: readiness.rows[0]?.budget_count ?? 0,
      postedOverheadRunCount: readiness.rows[0]?.overhead_count ?? 0,
      source: "posted_ledger" as const,
      monthly,
    };
  }

  private async projects(org: string, q: OperatingDashboardQuery) {
    return (
      await this.pool.query<Record<string, unknown>>(
        `select p.id "projectId",p.code,p.name,pa.display_name "clientName",p.state,p.starts_on::text "startsOn",p.ends_on::text "endsOn",
        coalesce(c.amount,p.budget_minor)::text "contractedMinor",coalesce(i.amount,0)::text "invoicedMinor",coalesce(e.amount,0)::text "actualCostMinor",
        greatest(coalesce(c.amount,p.budget_minor)-coalesce(i.amount,0),0)::text "backlogMinor",
        coalesce(b.direct_cost_total_minor,0)::text "budgetCostMinor",
        case when coalesce(b.direct_cost_total_minor,0)>0 then round(coalesce(e.amount,0)*10000.0/b.direct_cost_total_minor)::int else null end "burnBps",
        case when p.state='completed' then coalesce(e.amount,0)::text else greatest(coalesce(e.amount,0),coalesce(b.direct_cost_total_minor,0))::text end "estimateAtCompletionMinor",
        case when b.id is null then 'project-budget-fallback' else 'approved-direct-cost-budget' end "eacMethod"
       from projects p join parties pa on pa.organization_id=p.organization_id and pa.id=p.client_party_id
       left join lateral (select sum(value_minor) amount from contracts where organization_id=p.organization_id and project_id=p.id) c on true
       left join lateral (select sum(a.amount_minor) amount from commercial_document_allocations a join commercial_documents d on d.organization_id=a.organization_id and d.id=a.document_id where a.organization_id=p.organization_id and a.dimensions->>'projectId'=p.id and d.type='sales_invoice' and d.state in ('issued','posted','partially_paid','paid') and d.document_date<=$4::date) i on true
       left join lateral (select sum(a.amount_minor) amount from expense_allocations a join expenses x on x.organization_id=a.organization_id and x.id=a.expense_id where a.organization_id=p.organization_id and a.dimensions->>'projectId'=p.id and x.state='posted' and x.expense_date<=$4::date) e on true
       left join lateral (select id,direct_cost_total_minor from project_budget_versions where organization_id=p.organization_id and project_id=p.id and state='approved' order by version_number desc limit 1) b on true
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
    const [count, flags, rows] = await Promise.all([
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
    ]);
    return {
      pendingCount: count.rows[0]?.count ?? 0,
      byFlag: flags.rows,
      rows: rows.rows,
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
    const payrollRows = result.rows.filter((row) => row.kind === "payroll_master");
    const bonusRows = result.rows.filter((row) => row.kind === "bonus_control");
    return {
      source: "workbook_import_review_rows",
      accountingStatus: "unconfirmed_non_canonical",
      rowCount: result.rows.length,
      byKind,
      monthly,
      debt,
      expenseCategories,
      workforce: {
        payrollNetMinor: payrollRows
          .reduce((sum, row) => sum + amount(controlMoney(row.mappedData.payrollNetMinor)), 0n)
          .toString(),
        bonusMinor: bonusRows
          .reduce((sum, row) => sum + amount(controlMoney(row.mappedData.bonusMinor)), 0n)
          .toString(),
        payrollRowCount: payrollRows.length,
        bonusRowCount: bonusRows.length,
      },
      rows: result.rows.slice(0, q.limit),
    };
  }
}
