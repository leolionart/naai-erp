import { Injectable } from "@nestjs/common";
import pg from "pg";
import type {
  ProjectProfitabilityQuery,
  ProjectProfitabilitySource,
} from "./project-profitability.types.js";

type ProjectRow = {
  id: string;
  code: string;
  name: string;
  clientId: string;
  clientName: string;
  accountOwnerId: string;
  accountOwnerName: string;
  currency: string;
  defaultServiceLineCode: string | null;
  defaultServiceLineName: string | null;
};
type AmountRow = { amount: string; ids: string[]; journalIds?: string[] };
const ids = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

@Injectable()
export class PgProjectProfitabilityStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  async list(organizationId: string, query: ProjectProfitabilityQuery) {
    const values: unknown[] = [organizationId, query.periodEnd, query.periodStart];
    let where = "";
    for (const [value, column] of [
      [query.projectId, "p.id"],
      [query.clientId, "p.client_party_id"],
      [query.accountOwnerId, "p.owner_user_id"],
    ] as const) {
      if (value) {
        values.push(value);
        where += ` and ${column}=$${values.length}`;
      }
    }
    const projects = await this.pool.query<ProjectRow>(
      `select p.id,p.code,p.name,p.client_party_id "clientId",c.display_name "clientName",
              p.owner_user_id "accountOwnerId",u.display_name "accountOwnerName",p.currency,
              p.default_service_line_code "defaultServiceLineCode",sl.name "defaultServiceLineName"
         from projects p join organizations o on o.id=p.organization_id and o.base_currency=p.currency
         join parties c on c.organization_id=p.organization_id and c.id=p.client_party_id
         join users u on u.id=p.owner_user_id
         left join dimension_values sl on sl.organization_id=p.organization_id
          and sl.kind='service_line' and sl.code=p.default_service_line_code and sl.is_active
        where p.organization_id=$1 and p.starts_on<=$2::date and(p.ends_on is null or p.ends_on>=$3::date)${where}
        order by p.code,p.id`,
      values,
    );
    const loaded = await Promise.all(
      projects.rows.map((project) => this.loadProject(organizationId, project, query)),
    );
    return query.serviceLineId
      ? loaded.filter((item) => item.serviceLineCode === query.serviceLineId)
      : loaded;
  }

  async get(organizationId: string, projectId: string, query: ProjectProfitabilityQuery) {
    const rows = await this.list(organizationId, { ...query, projectId });
    return rows[0];
  }

  private async loadProject(
    organizationId: string,
    project: ProjectRow,
    query: ProjectProfitabilityQuery,
  ): Promise<ProjectProfitabilitySource> {
    const range = [organizationId, project.id, query.periodStart, query.periodEnd];
    const [recognition, invoices, collections, expenses, purchases, budget, overdue] =
      await Promise.all([
        this.pool.query<AmountRow>(
          `select coalesce(sum(amount_minor),0)::text amount,
                coalesce(array_agg(id order by id) filter(where id is not null),'{}') ids,
                coalesce(array_agg(journal_id order by journal_id) filter(where journal_id is not null),'{}') "journalIds"
           from revenue_recognition_events where organization_id=$1 and project_id=$2
            and effective_on between $3::date and $4::date and state='posted'
            and currency=(select base_currency from organizations where id=$1)`,
          range,
        ),
        this.pool.query<AmountRow>(
          `select coalesce(sum(case when d.type='sales_invoice' then x.amount else -x.amount end),0)::text amount,
                coalesce(array_agg(distinct d.id order by d.id),'{}') ids
           from commercial_documents d join lateral(
             select coalesce(sum(case when a.allocation_number is not null then a.amount_minor else l.net_minor end),0) amount
               from commercial_document_lines l left join commercial_document_allocations a
                on a.organization_id=l.organization_id and a.document_id=l.document_id and a.line_number=l.line_number
              where l.organization_id=d.organization_id and l.document_id=d.id
                and coalesce(a.dimensions->>'projectId',l.dimensions->>'projectId')=$2) x on x.amount<>0
          where d.organization_id=$1 and d.document_date between $3::date and $4::date
            and d.type in('sales_invoice','credit_note') and d.state in('issued','posted','partially_paid','paid')`,
          range,
        ),
        this.pool.query<AmountRow>(
          `select coalesce(round(sum(a.target_amount_minor*x.project_net_minor/nullif(d.net_minor,0))),0)::bigint::text amount,
                coalesce(array_agg(distinct r.id order by r.id),'{}') ids
           from reconciliation_allocations a join reconciliation_attempts r on r.organization_id=a.organization_id and r.id=a.reconciliation_id
           join commercial_documents d on d.organization_id=a.organization_id and d.id=a.commercial_document_id
           join lateral(select coalesce(sum(l.net_minor),0) project_net_minor from commercial_document_lines l
                         where l.organization_id=d.organization_id and l.document_id=d.id and l.dimensions->>'projectId'=$2) x on x.project_net_minor>0
          where a.organization_id=$1 and r.state='reconciled' and d.type='sales_invoice'
            and r.reconciled_at::date between $3::date and $4::date`,
          range,
        ),
        this.pool.query<AmountRow>(
          `select coalesce(sum(x.amount),0)::text amount,coalesce(array_agg(e.id order by e.id),'{}') ids,
                coalesce(array_agg(e.journal_id order by e.journal_id) filter(where e.journal_id is not null),'{}') "journalIds"
           from expenses e join lateral(
             select sum(case when a.allocation_number is not null then a.amount_minor else l.net_minor end) amount
               from expense_lines l left join expense_allocations a
                on a.organization_id=l.organization_id and a.expense_id=l.expense_id and a.line_number=l.line_number
              where l.organization_id=e.organization_id and l.expense_id=e.id
                and coalesce(a.dimensions->>'projectId',l.dimensions->>'projectId')=$2) x on x.amount<>0
          where e.organization_id=$1 and e.expense_date between $3::date and $4::date and e.state='posted'
            and e.currency=(select base_currency from organizations where id=$1)`,
          range,
        ),
        this.pool.query<AmountRow>(
          `select coalesce(sum(x.amount),0)::text amount,coalesce(array_agg(d.id order by d.id),'{}') ids,
                coalesce(array_agg(d.journal_id order by d.journal_id) filter(where d.journal_id is not null),'{}') "journalIds"
           from commercial_documents d join lateral(
             select sum(case when a.allocation_number is not null then a.amount_minor else l.net_minor end) amount
               from commercial_document_lines l left join commercial_document_allocations a
                on a.organization_id=l.organization_id and a.document_id=l.document_id and a.line_number=l.line_number
              where l.organization_id=d.organization_id and l.document_id=d.id
                and coalesce(a.dimensions->>'projectId',l.dimensions->>'projectId')=$2) x on x.amount<>0
          where d.organization_id=$1 and d.document_date between $3::date and $4::date and d.type='purchase_invoice'
            and d.state in('posted','partially_paid','paid') and d.currency=(select base_currency from organizations where id=$1)`,
          range,
        ),
        this.pool.query(
          `select id,direct_cost_total_minor::text "costMinor" from project_budget_versions
        where organization_id=$1 and project_id=$2 and state='approved' and effective_on<=$3::date
        order by effective_on desc,version_number desc limit 1`,
          [organizationId, project.id, query.asOf],
        ),
        this.pool.query<AmountRow>(
          `select coalesce(round(sum(greatest(d.net_minor*x.share_num/nullif(x.share_den,0)-coalesce(p.paid,0)*x.share_num/nullif(x.share_den,0),0))),0)::bigint::text amount,
                coalesce(array_agg(distinct d.id order by d.id),'{}') ids
           from commercial_documents d join lateral(select coalesce(sum(l.net_minor) filter(where l.dimensions->>'projectId'=$2),0) share_num,
             coalesce(sum(l.net_minor),0) share_den from commercial_document_lines l where l.organization_id=d.organization_id and l.document_id=d.id) x on x.share_num>0
           left join lateral(select coalesce(sum(a.target_amount_minor),0) paid from reconciliation_allocations a join reconciliation_attempts r
             on r.organization_id=a.organization_id and r.id=a.reconciliation_id where a.organization_id=d.organization_id
             and a.commercial_document_id=d.id and r.state='reconciled' and r.reconciled_at::date<=$3::date) p on true
          where d.organization_id=$1 and d.type='sales_invoice' and d.due_date<$3::date and d.document_date<=$3::date
            and d.state in('issued','posted','partially_paid','paid')`,
          [organizationId, project.id, query.asOf],
        ),
      ]);
    const rec = recognition.rows[0] ?? { amount: "0", ids: [] };
    const inv = invoices.rows[0] ?? { amount: "0", ids: [] };
    const col = collections.rows[0] ?? { amount: "0", ids: [] };
    const exp = expenses.rows[0] ?? { amount: "0", ids: [] };
    const pur = purchases.rows[0] ?? { amount: "0", ids: [] };
    const directCost = BigInt(exp.amount) + BigInt(pur.amount);
    const recognized = BigInt(rec.amount);
    const journalIds = [...ids(rec.journalIds), ...ids(exp.journalIds), ...ids(pur.journalIds)];
    const directGl = await this.ledgerAmount(organizationId, project.id, [
      ...ids(exp.journalIds),
      ...ids(pur.journalIds),
    ]);
    const budgetRow = budget.rows[0];
    return {
      organizationId,
      projectId: project.id,
      projectCode: project.code,
      projectName: project.name,
      clientId: project.clientId,
      clientName: project.clientName,
      ...(project.defaultServiceLineCode
        ? {
            serviceLineCode: project.defaultServiceLineCode,
            serviceLineName: project.defaultServiceLineName ?? project.defaultServiceLineCode,
          }
        : {}),
      accountOwnerId: project.accountOwnerId,
      accountOwnerName: project.accountOwnerName,
      startsOn: query.periodStart,
      endsOn: query.periodEnd,
      currency: project.currency,
      recognizedRevenueMinor: recognized,
      invoicedRevenueMinor: BigInt(inv.amount),
      collectedRevenueMinor: BigInt(col.amount),
      directProjectCostMinor: directCost,
      budgetRevenueMinor: 0n,
      budgetCostMinor: BigInt(budgetRow?.costMinor ?? 0),
      unbilledWorkMinor: recognized > BigInt(inv.amount) ? recognized - BigInt(inv.amount) : 0n,
      overdueArMinor: BigInt(overdue.rows[0]?.amount ?? 0),
      missingDimensionSourceIds: [],
      drilldown: {
        recognitionEventIds: ids(rec.ids),
        invoiceIds: [...new Set([...ids(inv.ids), ...ids(overdue.rows[0]?.ids)])],
        reconciliationIds: ids(col.ids),
        expenseIds: ids(exp.ids),
        purchaseDocumentIds: ids(pur.ids),
        budgetVersionIds: budgetRow?.id ? [String(budgetRow.id)] : [],
        journalIds: [...new Set(journalIds)],
      },
      breakdown: {
        revenueBreakdown: [
          { kind: "recognized", amountMinor: rec.amount, sourceIds: ids(rec.ids) },
          { kind: "invoiced", amountMinor: inv.amount, sourceIds: ids(inv.ids) },
          { kind: "collected", amountMinor: col.amount, sourceIds: ids(col.ids) },
        ],
        directCostBreakdown: [
          { kind: "expense", amountMinor: exp.amount, sourceIds: ids(exp.ids) },
          { kind: "purchase_document", amountMinor: pur.amount, sourceIds: ids(pur.ids) },
        ],
        glTie: this.tie(directCost, directGl),
      },
    };
  }

  private async ledgerAmount(organizationId: string, projectId: string, journalIds: string[]) {
    if (!journalIds.length) return 0n;
    const result = await this.pool.query<{ amount: string }>(
      `select coalesce(sum(coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0)),0)::text amount
         from journal_lines l join journal_entries j on j.organization_id=l.organization_id and j.id=l.journal_id
         join accounts a on a.organization_id=l.organization_id and a.code=l.account_code
        where l.organization_id=$1 and l.dimensions->>'projectId'=$2 and l.journal_id=any($3::text[])
          and j.state in('posted','reversed') and a.root_type='expense'`,
      [organizationId, projectId, journalIds],
    );
    return BigInt(result.rows[0]?.amount ?? 0);
  }

  private tie(source: bigint, ledger: bigint) {
    const difference = source - ledger;
    return {
      sourceMinor: source.toString(),
      ledgerMinor: ledger.toString(),
      differenceMinor: difference.toString(),
      status: difference === 0n ? "tied_out" : ledger === 0n ? "not_posted_to_gl" : "difference",
    };
  }
}
