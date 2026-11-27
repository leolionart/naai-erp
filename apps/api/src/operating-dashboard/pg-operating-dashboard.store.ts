export { deriveCompanyFunds } from "./operating-dashboard-settlement.sql.js";
import { Inject, Injectable } from "@nestjs/common";
import pg from "pg";
import { AGING_STORE, type AgingStore } from "../aging/aging.types.js";
import { queryWorkbookSourceControls } from "./workbook-source-controls.helper.js";
import type {
  OperatingDashboardQuery,
  OperatingDashboardReadModel,
  OperatingDashboardStore,
  WorkbookSourceControls,
} from "./operating-dashboard.types.js";
import { amount, ratioBps } from "./pg-operating-dashboard.store.shared.js";
import { financialsOperation } from "./operating-dashboard-financials.operation.js";

@Injectable()
export class PgOperatingDashboardStore implements OperatingDashboardStore {
  readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  constructor(@Inject(AGING_STORE) private readonly aging: AgingStore) {}

  async read(org: string, q: OperatingDashboardQuery): Promise<OperatingDashboardReadModel> {
    const organization = await this.pool.query<{ base_currency: string }>(
      "select base_currency from organizations where id=$1",
      [org],
    );
    if (!organization.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    const [projects, clients, quality, sourceControls, aging, financials] = await Promise.all([
      this.projects(org, q),
      this.clients(org, q, organization.rows[0].base_currency),
      this.quality(org, q.limit),
      this.sourceControls(org, q),
      this.aging.report(org, "ar", { asOf: q.asOf, limit: 100, includeSettled: false }),
      this.financials(org, q, organization.rows[0].base_currency),
    ]);
    const contracted = projects.reduce((sum, row) => sum + amount(row.contractedMinor), 0n);
    const invoiced = projects.reduce((sum, row) => sum + amount(row.invoicedMinor), 0n);
    const totalRevenue = clients.reduce((sum, row) => sum + amount(row.revenueMinor), 0n);
    const clientRows = clients.map((row) => ({
      ...row,
      shareBps: ratioBps(amount(row.revenueMinor), totalRevenue),
    }));
    const ar = amount(aging.outstandingTotalMinor);
    const creditSales = await this.creditSales(org, q.asOf, organization.rows[0].base_currency);
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

  financials = financialsOperation;

  async projects(org: string, q: OperatingDashboardQuery) {
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

  async clients(org: string, q: OperatingDashboardQuery, baseCurrency: string) {
    return (
      await this.pool.query<Record<string, unknown>>(
        `select d.party_id "clientId",p.display_name "clientName",
                sum(case when d.type='credit_note' then -d.gross_minor else d.gross_minor end)::text "revenueMinor",
                count(*)::int "invoiceCount"
       from commercial_documents d join parties p on p.organization_id=d.organization_id and p.id=d.party_id
       where d.organization_id=$1 and d.type in ('sales_invoice','credit_note') and d.currency=$5 and d.state in ('issued','posted','partially_paid','paid') and d.document_date between $2 and least($3::date,$4::date)
       group by d.party_id,p.display_name order by sum(case when d.type='credit_note' then -d.gross_minor else d.gross_minor end) desc,d.party_id`,
        [org, q.startsOn, q.endsOn, q.asOf, baseCurrency],
      )
    ).rows;
  }

  /**
   * DSO compares receivables (VAT-inclusive, as aging is gross) with sales over the trailing 90
   * days, so sales must also be gross; using net understated sales and overstated DSO by the VAT rate.
   */
  async creditSales(org: string, asOf: string, baseCurrency: string) {
    const result = await this.pool.query<{ amount: string }>(
      `select coalesce(sum(case when type='credit_note' then -gross_minor else gross_minor end),0)::text amount
         from commercial_documents
        where organization_id=$1 and type in ('sales_invoice','credit_note')
          and state in ('issued','posted','partially_paid','paid')
          and currency=$3
          and document_date between ($2::date-89) and $2`,
      [org, asOf, baseCurrency],
    );
    return amount(result.rows[0]?.amount);
  }

  async quality(org: string, limit: number) {
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

  async sourceControls(org: string, q: OperatingDashboardQuery): Promise<WorkbookSourceControls> {
    return queryWorkbookSourceControls(this.pool, org, q);
  }
}
