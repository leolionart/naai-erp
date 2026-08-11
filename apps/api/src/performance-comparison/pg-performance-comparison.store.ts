/* eslint-disable @typescript-eslint/no-explicit-any -- PostgreSQL rows are normalized at the read-model boundary. */
import { Injectable } from "@nestjs/common";
import { buildPerformanceComparison, type PerformanceAmount } from "@naai-erp/domain";
import pg from "pg";
import type {
  ActualFactQuery,
  ActualFactSummaryQuery,
  PerformanceContext,
  PerformanceQuery,
} from "./performance-comparison.types.js";

const days = (a: string, b: string) =>
  Math.floor((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;
const addDays = (x: string, n: number) => {
  const d = new Date(`${x}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
@Injectable()
export class PgPerformanceComparisonStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  async listFacts(c: PerformanceContext, q: ActualFactQuery) {
    const values: unknown[] = [c.organizationId];
    let where = "";
    for (const [value, sql] of [
      [q.actualBasis, "actual_basis"],
      [q.from, "effective_on >="],
      [q.to, "effective_on <="],
      [q.cursor, "id >"],
    ] as const)
      if (value) {
        values.push(value);
        where += sql.includes(" ")
          ? ` and ${sql} $${values.length}`
          : ` and ${sql}=$${values.length}`;
      }
    values.push(q.limit + 1);
    const rows = (
      await this.pool.query(
        `select id,actual_basis "actualBasis",effective_on "effectiveOn",amount_minor::text "amountMinor",currency,source_type "sourceType",source_id "sourceId",source_parent_id "sourceParentId",source_version "sourceVersion",dimensions from (${this.canonicalFactsSql()}) facts where organization_id=$1${where} order by id limit $${values.length}`,
        values,
      )
    ).rows;
    return {
      items: rows.slice(0, q.limit),
      ...(rows.length > q.limit ? { nextCursor: rows[q.limit - 1]?.id } : {}),
    };
  }

  async summarizeFacts(c: PerformanceContext, q: ActualFactSummaryQuery) {
    const organization = (
      await this.pool.query<{ base_currency: string }>(
        "select base_currency from organizations where id=$1",
        [c.organizationId],
      )
    ).rows[0];
    if (!organization) throw new Error("RESOURCE_NOT_FOUND");
    const result = await this.actual(
      c.organizationId,
      q.actualBasis,
      q.from,
      q.to,
      organization.base_currency,
      q.dimensions,
    );
    return {
      schemaVersion: 1,
      actualBasis: q.actualBasis,
      from: q.from,
      to: q.to,
      currency: organization.base_currency,
      amountMinor: result.amount.toString(),
      factCount: result.ids.length,
      sourceIds: result.ids,
      dimensions: q.dimensions,
    };
  }

  async report(c: PerformanceContext, q: PerformanceQuery) {
    const org = (
      await this.pool.query(`select base_currency,timezone from organizations where id=$1`, [
        c.organizationId,
      ])
    ).rows[0];
    if (!org) throw new Error("RESOURCE_NOT_FOUND");
    if (org.timezone !== "Asia/Ho_Chi_Minh") throw new Error("PERFORMANCE_TIMEZONE_UNSUPPORTED");
    const period = await this.period(c.organizationId, q);
    const localAsOf = this.localDate(q.asOfInstant, org.timezone),
      effectiveAsOf =
        localAsOf < period.startsOn
          ? period.startsOn
          : localAsOf > period.endsOn
            ? period.endsOn
            : localAsOf;
    const current = await this.actual(
      c.organizationId,
      q.actualBasis,
      period.startsOn,
      effectiveAsOf,
      org.base_currency,
      q.dimensions,
    );
    const target = await this.target(
      c.organizationId,
      q.actualBasis,
      period.startsOn,
      period.endsOn,
      org.base_currency,
      q.dimensions,
    );
    const forecast = await this.forecast(
      c.organizationId,
      q.forecastVersionId,
      period.startsOn,
      period.endsOn,
      q.dimensions,
      q.actualBasis,
      org.base_currency,
      effectiveAsOf,
    );
    const windows = await this.comparableWindows(c.organizationId, q, period, effectiveAsOf);
    const mom = await this.actual(
      c.organizationId,
      q.actualBasis,
      windows.mom.startsOn,
      windows.mom.endsOn,
      org.base_currency,
      q.dimensions,
    );
    const yoy = await this.actual(
      c.organizationId,
      q.actualBasis,
      windows.yoy.startsOn,
      windows.yoy.endsOn,
      org.base_currency,
      q.dimensions,
    );
    const amount = (
      x: { amount: bigint; ids: string[]; hasData: boolean },
      reason: string,
    ): PerformanceAmount =>
      x.hasData
        ? { status: "available", amountMinor: x.amount, sourceIds: x.ids }
        : { status: "missing", reason, sourceIds: [] };
    const result = buildPerformanceComparison({
      organizationId: c.organizationId,
      metricKey: "revenue",
      actualBasis: q.actualBasis,
      currency: org.base_currency,
      timezone: org.timezone,
      asOfInstant: q.asOfInstant,
      period: {
        basis: q.periodBasis,
        kind: q.periodBasis === "fiscal" ? "fiscal_period" : "month",
        id: q.periodId,
        label: q.periodId,
        startsOn: period.startsOn,
        endsOn: period.endsOn,
        ...(q.periodBasis === "fiscal"
          ? { fiscalYear: period.fiscalYear, fiscalPeriodNumber: period.periodNumber }
          : {}),
      },
      dimensions: q.dimensions,
      actualToDate: {
        ...amount(current, "actual_missing"),
        window: { startsOn: period.startsOn, endsOn: effectiveAsOf },
      },
      fullTarget:
        target.amount === null
          ? { status: "missing", reason: "published_target_missing", sourceIds: [] }
          : { status: "available", amountMinor: target.amount, sourceIds: target.ids },
      fullPeriodForecast:
        forecast.amount === null
          ? { status: "missing", reason: "published_forecast_snapshot_missing", sourceIds: [] }
          : { status: "available", amountMinor: forecast.amount, sourceIds: forecast.ids },
      previousPeriodComparable: { ...amount(mom, "previous_period_missing"), window: windows.mom },
      priorYearComparable: { ...amount(yoy, "prior_year_missing"), window: windows.yoy },
      ...(q.periodBasis === "fiscal"
        ? { fiscalMomWindow: windows.mom, fiscalYoyWindow: windows.yoy }
        : {}),
    });
    return { schemaVersion: 1, ...this.serialize(result) };
  }

  private async period(org: string, q: PerformanceQuery) {
    if (q.periodBasis === "calendar") {
      const match = /^CAL-(\d{4}-(?:0[1-9]|1[0-2]))$/.exec(q.periodId);
      if (!match) throw new Error("VALIDATION_FAILED");
      const start = `${match[1]}-01`,
        d = new Date(`${start}T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + 1);
      d.setUTCDate(0);
      return { startsOn: start, endsOn: d.toISOString().slice(0, 10) };
    }
    const match = /^FY(\d{4})-P(\d{1,2})$/.exec(q.periodId);
    if (!match) throw new Error("VALIDATION_FAILED");
    const row = (
      await this.pool.query(
        `select starts_on::text "startsOn",ends_on::text "endsOn",fiscal_year "fiscalYear",period_number "periodNumber" from fiscal_periods where organization_id=$1 and fiscal_year=$2 and period_number=$3`,
        [org, Number(match[1]), Number(match[2])],
      )
    ).rows[0];
    if (!row) throw new Error("RESOURCE_NOT_FOUND");
    return row;
  }
  private localDate(value: string, tz: string) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date(value)),
      part = (x: string) => parts.find((p) => p.type === x)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  }
  private shiftMonth(value: string, months: number) {
    const d = new Date(`${value}T00:00:00Z`),
      day = d.getUTCDate(),
      target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1)),
      last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(day, last));
    return target.toISOString().slice(0, 10);
  }
  private shiftYear(value: string, years: number) {
    const d = new Date(`${value}T00:00:00Z`),
      year = d.getUTCFullYear() + years,
      last = new Date(Date.UTC(year, d.getUTCMonth() + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, d.getUTCMonth(), Math.min(d.getUTCDate(), last)))
      .toISOString()
      .slice(0, 10);
  }
  private async comparableWindows(org: string, q: PerformanceQuery, p: any, effectiveAsOf: string) {
    if (q.periodBasis === "calendar")
      return {
        mom: {
          startsOn: this.shiftMonth(p.startsOn, -1),
          endsOn: this.shiftMonth(effectiveAsOf, -1),
        },
        yoy: {
          startsOn: this.shiftYear(p.startsOn, -1),
          endsOn: this.shiftYear(effectiveAsOf, -1),
        },
      };
    const previous = (
        await this.pool.query(
          `select starts_on::text "startsOn",ends_on::text "endsOn" from fiscal_periods where organization_id=$1 and ends_on<$2 order by ends_on desc limit 1`,
          [org, p.startsOn],
        )
      ).rows[0],
      priorYear = (
        await this.pool.query(
          `select starts_on::text "startsOn",ends_on::text "endsOn" from fiscal_periods where organization_id=$1 and fiscal_year=$2 and period_number=$3`,
          [org, p.fiscalYear - 1, p.periodNumber],
        )
      ).rows[0],
      elapsed = days(p.startsOn, effectiveAsOf),
      mapped = (x: any) =>
        x
          ? {
              startsOn: x.startsOn,
              endsOn: addDays(x.startsOn, Math.min(elapsed, days(x.startsOn, x.endsOn)) - 1),
            }
          : undefined;
    if (!previous || !priorYear) throw new Error("COMPARISON_PERIOD_NOT_FOUND");
    return { mom: mapped(previous)!, yoy: mapped(priorYear)! };
  }
  private serialize(value: any): any {
    if (typeof value === "bigint") return value.toString();
    if (Array.isArray(value)) return value.map((x) => this.serialize(x));
    if (value && typeof value === "object")
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, this.serialize(v)]));
    return value;
  }
  private dims(q: Record<string, string>, values: unknown[]) {
    if (!Object.keys(q).length) return "";
    values.push(JSON.stringify(q));
    return ` and dimensions @> $${values.length}::jsonb`;
  }
  private async actual(
    org: string,
    basis: string,
    from: string,
    to: string,
    currency: string,
    dimensions: Record<string, string>,
  ) {
    const values: unknown[] = [org, basis, from, to, currency],
      where = this.dims(dimensions, values),
      rows = (
        await this.pool.query(
          `select id,amount_minor::text amount from (${this.canonicalFactsSql()}) facts where organization_id=$1 and actual_basis=$2 and effective_on between $3 and $4 and currency=$5${where}`,
          values,
        )
      ).rows;
    return {
      amount: rows.reduce((n, r) => n + BigInt(r.amount), 0n),
      ids: rows.map((r) => r.id),
      hasData: rows.length > 0,
    };
  }
  private canonicalFactsSql() {
    return `
      select e.organization_id,'recognition:'||e.id id,'recognized'::text actual_basis,
        e.effective_on::text effective_on,e.amount_minor,e.currency,
        'revenue_recognition_event'::text source_type,e.id source_id,null::text source_parent_id,
        e.version::text source_version,
        jsonb_strip_nulls(jsonb_build_object('projectId',e.project_id,'clientId',p.client_party_id,'ownerId',p.owner_user_id) || coalesce(e.policy_snapshot->'dimensions','{}'::jsonb)) dimensions
      from revenue_recognition_events e
      join projects p on p.organization_id=e.organization_id and p.id=e.project_id
      where e.state='posted'
      union all
      select d.organization_id,'invoice-allocation:'||d.id||':'||a.line_number||':'||a.allocation_number,
        'invoiced',d.document_date::text,case when d.type='credit_note' then -a.amount_minor else a.amount_minor end,
        d.currency,'commercial_document_allocation',d.id||':'||a.line_number||':'||a.allocation_number,d.id,
        d.version::text,a.dimensions
      from commercial_documents d
      join commercial_document_allocations a on a.organization_id=d.organization_id and a.document_id=d.id
      left join commercial_documents original on original.organization_id=d.organization_id and original.id=d.original_document_id
      where d.state in ('issued','posted','partially_paid','paid') and (d.type='sales_invoice' or (d.type='credit_note' and original.type='sales_invoice'))
      union all
      select d.organization_id,'invoice:'||d.id,'invoiced',d.document_date::text,
        case when d.type='credit_note' then -d.net_minor else d.net_minor end,d.currency,
        'commercial_document',d.id,null::text,d.version::text,'{}'::jsonb
      from commercial_documents d
      left join commercial_documents original on original.organization_id=d.organization_id and original.id=d.original_document_id
      where d.state in ('issued','posted','partially_paid','paid') and (d.type='sales_invoice' or (d.type='credit_note' and original.type='sales_invoice'))
        and not exists(select 1 from commercial_document_allocations a where a.organization_id=d.organization_id and a.document_id=d.id)
      union all
      select a.organization_id,'collection:'||a.id,'collected',bt.booking_date::text,
        case when a.target_currency=o.base_currency then a.target_amount_minor else a.base_amount_minor end,
        o.base_currency,'reconciliation_allocation',a.id,d.id,ra.version::text,coalesce(common_dims.dimensions,'{}'::jsonb)
      from reconciliation_allocations a
      join reconciliation_attempts ra on ra.organization_id=a.organization_id and ra.id=a.reconciliation_id
      join payment_reconciliations pr on pr.organization_id=ra.organization_id and pr.id=ra.reconciliation_id
      join bank_transactions bt on bt.organization_id=pr.organization_id and bt.id=pr.bank_transaction_id
      join commercial_documents d on d.organization_id=a.organization_id and d.id=a.commercial_document_id
      join organizations o on o.id=a.organization_id
      left join lateral (select case when count(*)>0 and count(distinct ca.dimensions)=1 then (array_agg(ca.dimensions))[1] else '{}'::jsonb end dimensions from commercial_document_allocations ca where ca.organization_id=d.organization_id and ca.document_id=d.id) common_dims on true
      where pr.direction='receipt' and ra.state='reconciled' and d.type='sales_invoice'`;
  }
  private async target(
    org: string,
    basis: string,
    start: string,
    end: string,
    currency: string,
    dimensions: Record<string, string>,
  ) {
    const values: unknown[] = [org, basis, start, end, currency],
      clauses = [
        dimensions.teamId ? `team_id=$${values.push(dimensions.teamId)}` : "team_id is null",
        dimensions.serviceLineCode
          ? `service_line_code=$${values.push(dimensions.serviceLineCode)}`
          : "service_line_code is null",
        dimensions.ownerId ? `owner_id=$${values.push(dimensions.ownerId)}` : "owner_id is null",
      ];
    const rows = (
      await this.pool.query(
        `select id,amount_minor::text amount from revenue_target_versions where organization_id=$1 and actual_basis=$2 and starts_on=$3 and ends_on=$4 and currency=$5 and state='published' and ${clauses.join(" and ")}`,
        values,
      )
    ).rows;
    return {
      amount: rows.length ? rows.reduce((n, r) => n + BigInt(r.amount), 0n) : null,
      ids: rows.map((r) => r.id),
    };
  }
  private async forecast(
    org: string,
    id: string | undefined,
    start: string,
    end: string,
    dimensions: Record<string, string>,
    actualBasis: string,
    currency: string,
    cutoff: string,
  ) {
    const values: unknown[] = [org, start, end, actualBasis, currency, cutoff];
    let where = "";
    if (id) {
      values.push(id);
      where += ` and id=$${values.length}`;
    }
    for (const [column, value] of [
      ["team_id", dimensions.teamId],
      ["service_line_code", dimensions.serviceLineCode],
      ["owner_id", dimensions.ownerId],
    ] as const) {
      if (value) {
        values.push(value);
        where += ` and ${column}=$${values.length}`;
      } else where += ` and ${column} is null`;
    }
    const row = (
      await this.pool.query(
        `select id,composition_snapshot from forecast_versions where organization_id=$1 and starts_on=$2 and ends_on=$3 and actual_basis=$4 and currency=$5 and as_of_date<=$6 and state='published' and composition_snapshot is not null${where} order by published_at desc limit 1`,
        values,
      )
    ).rows[0];
    return {
      amount: row ? BigInt(String(row.composition_snapshot.projectedRevenueMinor)) : null,
      ids: row ? [row.id] : [],
    };
  }
}
