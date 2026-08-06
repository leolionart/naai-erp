import { Inject, Injectable } from "@nestjs/common";
import pg from "pg";
import { AGING_STORE, type AgingStore } from "../aging/aging.types.js";
import type {
  OperatingDashboardQuery,
  OperatingDashboardReadModel,
  OperatingDashboardStore,
} from "./operating-dashboard.types.js";

const amount = (value: unknown) => BigInt(String(value ?? 0));
const ratioBps = (part: bigint, total: bigint) =>
  total > 0n ? Number((part * 10_000n + total / 2n) / total) : null;

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
    const [projects, clients, quality, aging] = await Promise.all([
      this.projects(org, q),
      this.clients(org, q),
      this.quality(org, q.limit),
      this.aging.report(org, "ar", { asOf: q.asOf, limit: 100, includeSettled: false }),
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
      dataQuality: quality,
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
       left join lateral (select sum(a.amount_minor) amount from commercial_document_allocations a join commercial_documents d on d.organization_id=a.organization_id and d.id=a.document_id where a.organization_id=p.organization_id and a.dimensions->>'projectId'=p.id and d.type='sales_invoice' and d.state in ('issued','partially_paid','paid')) i on true
       left join lateral (select sum(a.amount_minor) amount from expense_allocations a join expenses x on x.organization_id=a.organization_id and x.id=a.expense_id where a.organization_id=p.organization_id and a.dimensions->>'projectId'=p.id and x.state='posted') e on true
       left join lateral (select id,direct_cost_total_minor from project_budget_versions where organization_id=p.organization_id and project_id=p.id and state='approved' order by version_number desc limit 1) b on true
       where p.organization_id=$1 and p.starts_on<=$2 and (p.ends_on is null or p.ends_on>=$3)
       order by greatest(coalesce(c.amount,p.budget_minor)-coalesce(i.amount,0),0) desc,p.id`,
        [org, q.endsOn, q.startsOn],
      )
    ).rows;
  }

  private async clients(org: string, q: OperatingDashboardQuery) {
    return (
      await this.pool.query<Record<string, unknown>>(
        `select d.party_id "clientId",p.display_name "clientName",sum(d.net_minor)::text "revenueMinor",count(*)::int "invoiceCount"
       from commercial_documents d join parties p on p.organization_id=d.organization_id and p.id=d.party_id
       where d.organization_id=$1 and d.type='sales_invoice' and d.state in ('issued','partially_paid','paid') and d.document_date between $2 and $3
       group by d.party_id,p.display_name order by sum(d.net_minor) desc,d.party_id`,
        [org, q.startsOn, q.endsOn],
      )
    ).rows;
  }

  private async creditSales(org: string, asOf: string) {
    const result = await this.pool.query<{ amount: string }>(
      `select coalesce(sum(net_minor),0)::text amount from commercial_documents where organization_id=$1 and type='sales_invoice' and state in ('issued','partially_paid','paid') and document_date between ($2::date-89) and $2`,
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
}
