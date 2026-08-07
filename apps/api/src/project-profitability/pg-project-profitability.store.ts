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
  startsOn: string;
  endsOn: string | null;
  currency: string;
};

type AmountRows = { amount: string; ids: string[]; journalIds: string[] };

const ids = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

@Injectable()
export class PgProjectProfitabilityStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  async list(organizationId: string, query: ProjectProfitabilityQuery) {
    const values: unknown[] = [organizationId];
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
              p.owner_user_id "accountOwnerId",u.display_name "accountOwnerName",
              p.starts_on::text "startsOn",p.ends_on::text "endsOn",p.currency
         from projects p
         join organizations o on o.id=p.organization_id and o.base_currency=p.currency
         join parties c on c.organization_id=p.organization_id and c.id=p.client_party_id
         join users u on u.id=p.owner_user_id
        where p.organization_id=$1 and p.starts_on<=$${values.length + 1}::date
          and(p.ends_on is null or p.ends_on>=$${values.length + 2}::date)${where}
        order by p.code,p.id`,
      [...values, query.periodEnd, query.periodStart],
    );
    const loaded = await Promise.all(
      projects.rows.map((project) => this.loadProject(organizationId, project, query)),
    );
    return query.serviceLineId
      ? loaded.filter((item) => item.serviceLineCode === query.serviceLineId)
      : loaded;
  }

  async get(organizationId: string, projectId: string, query: ProjectProfitabilityQuery) {
    const result = await this.pool.query<ProjectRow>(
      `select p.id,p.code,p.name,p.client_party_id "clientId",c.display_name "clientName",
              p.owner_user_id "accountOwnerId",u.display_name "accountOwnerName",
              p.starts_on::text "startsOn",p.ends_on::text "endsOn",p.currency
         from projects p
         join organizations o on o.id=p.organization_id and o.base_currency=p.currency
         join parties c on c.organization_id=p.organization_id and c.id=p.client_party_id
         join users u on u.id=p.owner_user_id
        where p.organization_id=$1 and p.id=$2`,
      [organizationId, projectId],
    );
    return result.rows[0] ? this.loadProject(organizationId, result.rows[0], query) : undefined;
  }

  private async loadProject(
    organizationId: string,
    project: ProjectRow,
    query: ProjectProfitabilityQuery,
  ): Promise<ProjectProfitabilitySource> {
    const range = [organizationId, project.id, query.periodStart, query.periodEnd];
    const asOf = query.asOf;
    const [
      recognition,
      invoices,
      collections,
      linkedCosts,
      allocatedCosts,
      laborCosts,
      adjustments,
      overhead,
      time,
      capacity,
      budget,
      overdue,
      serviceLines,
    ] = await Promise.all([
      this.pool.query(
        `select coalesce(sum(amount_minor),0)::text amount,
                coalesce(array_agg(id order by id) filter(where id is not null),'{}') ids,
                coalesce(array_agg(journal_id order by journal_id) filter(where journal_id is not null),'{}') "journalIds"
           from revenue_recognition_events
          where organization_id=$1 and project_id=$2 and effective_on between $3::date and $4::date
            and state='posted' and currency=(select base_currency from organizations where id=$1)`,
        range,
      ),
      this.pool.query(
        `select coalesce(sum(case when d.type='sales_invoice' then l.net_minor else -l.net_minor end),0)::text amount,
                coalesce(array_agg(distinct d.id order by d.id),'{}') ids
           from commercial_document_lines l join commercial_documents d
             on d.organization_id=l.organization_id and d.id=l.document_id
          where l.organization_id=$1 and l.dimensions->>'projectId'=$2
            and d.document_date between $3::date and $4::date
            and d.currency=(select base_currency from organizations where id=$1)
            and d.type in('sales_invoice','credit_note')
            and d.state in('issued','posted','partially_paid','paid')`,
        range,
      ),
      this.pool.query(
        `select coalesce(round(sum(a.target_amount_minor * x.project_net_minor / nullif(d.net_minor,0))),0)::bigint::text amount,
                coalesce(array_agg(distinct r.id order by r.id),'{}') ids
           from reconciliation_allocations a
           join reconciliation_attempts r on r.organization_id=a.organization_id and r.id=a.reconciliation_id
           join commercial_documents d on d.organization_id=a.organization_id and d.id=a.commercial_document_id
           join lateral(select coalesce(sum(l.net_minor),0) project_net_minor from commercial_document_lines l
                         where l.organization_id=d.organization_id and l.document_id=d.id
                           and l.dimensions->>'projectId'=$2) x on x.project_net_minor>0
          where a.organization_id=$1 and r.state='reconciled' and d.type='sales_invoice'
            and r.reconciled_at::date between $3::date and $4::date`,
        range,
      ),
      this.pool.query(
        `select coalesce(sum(c.base_amount_minor),0)::text amount,
                coalesce(array_agg(c.id order by c.id),'{}') ids,
                coalesce(array_agg(c.journal_id order by c.journal_id) filter(where c.journal_id is not null),'{}') "journalIds"
           from project_cost_items c left join journal_entries j
             on j.organization_id=c.organization_id and j.id=c.journal_id
          where c.organization_id=$1 and c.project_id=$2 and c.effective_on between $3::date and $4::date
            and c.cost_class='direct' and c.basis='ledger'
            and c.source_type not in('timesheet','adjustment')
            and(c.journal_id is null or j.state='posted')`,
        range,
      ),
      this.pool.query(
        `select coalesce(sum(s.base_amount_minor),0)::text amount,
                coalesce(array_agg(a.source_cost_item_id order by a.source_cost_item_id),'{}') ids,
                coalesce(array_agg(a.journal_id order by a.journal_id) filter(where a.journal_id is not null),'{}') "journalIds"
           from direct_cost_allocations a join direct_cost_allocation_splits s
             on s.organization_id=a.organization_id and s.allocation_id=a.id
          where a.organization_id=$1 and s.project_id=$2 and a.state='posted'
            and exists(select 1 from project_cost_items c where c.organization_id=a.organization_id
              and c.id=a.source_cost_item_id and c.effective_on between $3::date and $4::date)`,
        range,
      ),
      this.pool.query(
        `select coalesce(sum(x.applied_cost_minor),0)::text amount,
                coalesce(array_agg(distinct t.id order by t.id),'{}') ids
           from timesheet_entries e join timesheets t
             on t.organization_id=e.organization_id and t.id=e.timesheet_id
           join timesheet_cost_snapshots x on x.organization_id=e.organization_id and x.entry_id=e.id
          where e.organization_id=$1 and e.project_id=$2 and e.work_date between $3::date and $4::date
            and t.state in('approved','locked','billed')
            and x.currency=(select base_currency from organizations where id=$1)
            and not exists(select 1 from project_cost_items c where c.organization_id=e.organization_id
              and c.source_type='timesheet' and c.source_id=e.id and c.basis='ledger')`,
        range,
      ),
      this.pool.query(
        `select coalesce(sum(a.cost_delta_minor),0)::text amount,
                coalesce(array_agg(distinct a.id order by a.id),'{}') ids
           from timesheet_adjustments a join timesheet_entries e
             on e.organization_id=a.organization_id and e.id=a.entry_id
          where a.organization_id=$1 and e.project_id=$2 and a.work_date between $3::date and $4::date
            and a.state='approved' and a.currency=(select base_currency from organizations where id=$1)
            and not exists(select 1 from project_cost_items c where c.organization_id=a.organization_id
              and c.source_type='adjustment' and c.source_id=a.id and c.basis='ledger')`,
        range,
      ),
      this.pool.query(
        `select p.cost_class "costClass",coalesce(sum(s.amount_minor),0)::text amount,
                coalesce(array_agg(distinct r.id order by r.id),'{}') "runIds",
                coalesce(array_agg(distinct r.pool_id order by r.pool_id),'{}') "poolIds",
                coalesce(array_agg(distinct r.policy_id order by r.policy_id),'{}') "policyIds",
                coalesce(array_agg(distinct r.journal_id order by r.journal_id) filter(where r.journal_id is not null),'{}') "journalIds"
           from overhead_allocation_runs r join overhead_allocation_splits s
             on s.organization_id=r.organization_id and s.run_id=r.id
           join overhead_allocation_policies p on p.organization_id=r.organization_id and p.id=r.policy_id
          where r.organization_id=$1 and s.project_id=$2 and r.period_end between $3::date and $4::date
            and r.state='posted' and r.currency=(select base_currency from organizations where id=$1)
          group by p.cost_class`,
        range,
      ),
      this.pool.query(
        `select coalesce(sum(e.minutes+a.minutes_delta),0)::int "projectMinutes",
                coalesce(sum(case when e.billable then e.minutes+a.minutes_delta else 0 end),0)::int "billableMinutes",
                coalesce(array_agg(distinct t.id order by t.id),'{}') ids
           from timesheet_entries e join timesheets t
             on t.organization_id=e.organization_id and t.id=e.timesheet_id
           left join lateral(select coalesce(sum(x.minute_delta),0)::int minutes_delta
                               from timesheet_adjustments x where x.organization_id=e.organization_id
                                and x.entry_id=e.id and x.state='approved') a on true
          where e.organization_id=$1 and e.project_id=$2 and e.work_date between $3::date and $4::date
            and t.state in('approved','locked','billed')`,
        range,
      ),
      this.pool.query(
        `select coalesce(sum(v.weekly_minutes / nullif(jsonb_array_length(v.workdays),0)),0)::int amount
           from generate_series($2::date,$3::date,'1 day') d(day)
           join workforce_profiles w on w.organization_id=$1 and w.active
             and w.starts_on<=d.day and(w.ends_on is null or w.ends_on>=d.day)
             and exists(select 1 from timesheets t join timesheet_entries e
                         on e.organization_id=t.organization_id and e.timesheet_id=t.id
                        where t.organization_id=w.organization_id and t.worker_id=w.id
                          and e.project_id=$4 and e.work_date between $2::date and $3::date
                          and t.state in('approved','locked','billed'))
           join lateral(select c.weekly_minutes,c.workdays from workforce_capacity_versions c
                         where c.organization_id=w.organization_id and c.worker_id=w.id
                           and c.effective_from<=d.day and(c.effective_to is null or c.effective_to>=d.day)
                           and exists(select 1 from jsonb_array_elements_text(c.workdays) wd(value)
                                       where wd.value::int=extract(isodow from d.day)::int)
                         order by c.effective_from desc,c.version desc limit 1) v on true`,
        [organizationId, query.periodStart, query.periodEnd, project.id],
      ),
      this.pool.query(
        `select id,revenue_total_minor::text "revenueMinor",
                (direct_cost_total_minor+overhead_total_minor)::text "costMinor"
           from project_budget_versions
          where organization_id=$1 and project_id=$2 and state='approved' and effective_on<=$3::date
          order by effective_on desc,version_number desc limit 1`,
        [organizationId, project.id, asOf],
      ),
      this.pool.query(
        `select coalesce(round(sum(greatest(d.net_minor*x.share_num/nullif(x.share_den,0)-coalesce(p.paid,0)*x.share_num/nullif(x.share_den,0),0))),0)::bigint::text amount,
                coalesce(array_agg(distinct d.id order by d.id),'{}') ids
           from commercial_documents d
           join lateral(select coalesce(sum(l.net_minor) filter(where l.dimensions->>'projectId'=$2),0) share_num,
                               coalesce(sum(l.net_minor),0) share_den
                          from commercial_document_lines l where l.organization_id=d.organization_id and l.document_id=d.id) x on x.share_num>0
           left join lateral(select coalesce(sum(a.target_amount_minor),0) paid
                               from reconciliation_allocations a join reconciliation_attempts r
                                on r.organization_id=a.organization_id and r.id=a.reconciliation_id
                              where a.organization_id=d.organization_id and a.commercial_document_id=d.id
                                and r.state='reconciled' and r.reconciled_at::date<=$3::date) p on true
          where d.organization_id=$1 and d.type='sales_invoice' and d.due_date<$3::date
            and d.document_date<=$3::date and d.state in('issued','posted','partially_paid','paid')`,
        [organizationId, project.id, asOf],
      ),
      this.pool.query(
        `select coalesce(array_agg(distinct e.service_line_code order by e.service_line_code)
                         filter(where e.service_line_code is not null),'{}') ids,
                coalesce(array_agg(e.id order by e.id) filter(where e.service_line_code is null),'{}') missing
           from timesheet_entries e join timesheets t on t.organization_id=e.organization_id and t.id=e.timesheet_id
          where e.organization_id=$1 and e.project_id=$2 and e.work_date between $3::date and $4::date
            and t.state in('approved','locked','billed')`,
        range,
      ),
    ]);

    const rec = recognition.rows[0] as AmountRows;
    const inv = invoices.rows[0] as AmountRows;
    const col = collections.rows[0] as AmountRows;
    const linked = linkedCosts.rows[0] as AmountRows;
    const allocated = allocatedCosts.rows[0] as AmountRows;
    const labor = laborCosts.rows[0] as AmountRows;
    const adjusted = adjustments.rows[0] as AmountRows;
    const variable = overhead.rows.find((row) => row.costClass === "variable");
    const fixed = overhead.rows.find((row) => row.costClass === "fixed");
    const timeRow = time.rows[0] ?? { projectMinutes: 0, billableMinutes: 0, ids: [] };
    const budgetRow = budget.rows[0];
    const serviceLineIds = ids(serviceLines.rows[0]?.ids);
    const serviceLineCode = serviceLineIds.length === 1 ? serviceLineIds[0] : undefined;
    const missing = [
      ...ids(serviceLines.rows[0]?.missing),
      ...(serviceLineIds.length === 1
        ? []
        : [
            `project:${project.id}:${serviceLineIds.length ? "multiple-service-lines" : "service-line-unclassified"}`,
          ]),
    ];
    const directCost =
      BigInt(linked?.amount ?? 0) +
      BigInt(allocated?.amount ?? 0) +
      BigInt(labor?.amount ?? 0) +
      BigInt(adjusted?.amount ?? 0);
    const recognized = BigInt(rec?.amount ?? 0);
    const invoiced = BigInt(inv?.amount ?? 0);
    const journalIds = [
      ...ids(rec?.journalIds),
      ...ids(linked?.journalIds),
      ...ids(allocated?.journalIds),
      ...ids(variable?.journalIds),
      ...ids(fixed?.journalIds),
    ];
    const directJournalIds = [...ids(linked?.journalIds), ...ids(allocated?.journalIds)];
    const [recognizedGl, directGl, overheadGl] = await Promise.all([
      this.ledgerAmount(organizationId, project.id, ids(rec?.journalIds), "revenue"),
      this.ledgerAmount(organizationId, project.id, directJournalIds, "expense"),
      this.ledgerAmount(
        organizationId,
        project.id,
        [...ids(variable?.journalIds), ...ids(fixed?.journalIds)],
        "expense",
      ),
    ]);
    const overheadAmount = BigInt(variable?.amount ?? 0) + BigInt(fixed?.amount ?? 0);
    const glTie = {
      basis: "posted_journal_lines_in_organization_base_currency",
      recognizedRevenue: this.tie(recognized, recognizedGl),
      directProjectCost: {
        ...this.tie(directCost, directGl),
        coverage: directCost === directGl ? "full" : "partial",
        nonGlManagementCostMinor: (directCost > directGl ? directCost - directGl : 0n).toString(),
        note:
          directCost === directGl
            ? "All included direct costs tie to project-dimensioned journal lines."
            : "Approved labor snapshots and other management-basis costs may not have a posted GL journal yet.",
      },
      allocatedOverhead: this.tie(overheadAmount, overheadGl),
    };

    return {
      organizationId,
      projectId: project.id,
      projectCode: project.code,
      projectName: project.name,
      clientId: project.clientId,
      clientName: project.clientName,
      ...(serviceLineCode ? { serviceLineCode, serviceLineName: serviceLineCode } : {}),
      accountOwnerId: project.accountOwnerId,
      accountOwnerName: project.accountOwnerName,
      startsOn: query.periodStart,
      endsOn: query.periodEnd,
      currency: project.currency,
      recognizedRevenueMinor: recognized,
      invoicedRevenueMinor: invoiced,
      collectedRevenueMinor: BigInt(col?.amount ?? 0),
      directProjectCostMinor: directCost,
      variableOverheadMinor: BigInt(variable?.amount ?? 0),
      fixedOverheadMinor: BigInt(fixed?.amount ?? 0),
      budgetRevenueMinor: BigInt(budgetRow?.revenueMinor ?? 0),
      budgetCostMinor: BigInt(budgetRow?.costMinor ?? 0),
      unbilledWorkMinor: recognized > invoiced ? recognized - invoiced : 0n,
      overdueArMinor: BigInt(overdue.rows[0]?.amount ?? 0),
      billableMinutes: Number(timeRow.billableMinutes ?? 0),
      projectMinutes: Number(timeRow.projectMinutes ?? 0),
      availableMinutes: Number(capacity.rows[0]?.amount ?? 0),
      missingDimensionSourceIds: missing,
      drilldown: {
        recognitionEventIds: ids(rec?.ids),
        invoiceIds: [...new Set([...ids(inv?.ids), ...ids(overdue.rows[0]?.ids)])],
        reconciliationIds: ids(col?.ids),
        directCostItemIds: [...ids(linked?.ids), ...ids(allocated?.ids), ...ids(adjusted?.ids)],
        overheadAllocationRunIds: [...ids(variable?.runIds), ...ids(fixed?.runIds)],
        overheadAllocationSplitIds: [
          ...ids(variable?.runIds).map((runId) => `${runId}:${project.id}`),
          ...ids(fixed?.runIds).map((runId) => `${runId}:${project.id}`),
        ],
        timesheetIds: [...new Set([...ids(labor?.ids), ...ids(timeRow.ids)])],
        budgetVersionIds: budgetRow?.id ? [String(budgetRow.id)] : [],
        journalIds: [...new Set(journalIds)],
      },
      breakdown: {
        revenueBreakdown: [
          { kind: "recognized", amountMinor: recognized.toString(), sourceIds: ids(rec?.ids) },
          { kind: "invoiced", amountMinor: invoiced.toString(), sourceIds: ids(inv?.ids) },
          { kind: "collected", amountMinor: String(col?.amount ?? 0), sourceIds: ids(col?.ids) },
        ],
        directCostBreakdown: [
          {
            kind: "source_linked",
            amountMinor: String(linked?.amount ?? 0),
            sourceIds: ids(linked?.ids),
          },
          {
            kind: "allocated",
            amountMinor: String(allocated?.amount ?? 0),
            sourceIds: ids(allocated?.ids),
          },
          { kind: "labor", amountMinor: String(labor?.amount ?? 0), sourceIds: ids(labor?.ids) },
          {
            kind: "adjustment",
            amountMinor: String(adjusted?.amount ?? 0),
            sourceIds: ids(adjusted?.ids),
          },
        ],
        overheadBreakdown: overhead.rows.map((row) => ({
          costClass: row.costClass,
          amountMinor: row.amount,
          sourcePoolIds: ids(row.poolIds),
          policyIds: ids(row.policyIds),
          runIds: ids(row.runIds),
          journalIds: ids(row.journalIds),
        })),
        glTie,
      },
    };
  }

  private async ledgerAmount(
    organizationId: string,
    projectId: string,
    journalIds: string[],
    rootType: "revenue" | "expense",
  ) {
    if (!journalIds.length) return 0n;
    const result = await this.pool.query<{ amount: string }>(
      `select coalesce(sum(case when $4::account_root_type='revenue'::account_root_type then coalesce(l.credit_minor,0)-coalesce(l.debit_minor,0)
                                else coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0) end),0)::text amount
         from journal_lines l join journal_entries j on j.organization_id=l.organization_id and j.id=l.journal_id
         join accounts a on a.organization_id=l.organization_id and a.code=l.account_code
        where l.organization_id=$1 and l.dimensions->>'projectId'=$2 and l.journal_id=any($3::text[])
          and j.state in('posted','reversed') and a.root_type=$4::account_root_type`,
      [organizationId, projectId, journalIds, rootType],
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
