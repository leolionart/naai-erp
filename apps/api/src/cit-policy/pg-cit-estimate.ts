import type pg from "pg";
import type {
  CitRateScheduleContract,
  CitRateTierContract,
  EstimatedCitReportContract,
} from "@naai-erp/contracts";
import {
  LAW_67_2025_CIT_SCHEDULE,
  resolveEstimatedCit,
  type CitRateSchedule,
  type CitRateTier,
} from "@naai-erp/domain";

type Queryable = Pick<pg.Pool, "query">;

export type TierRow = Readonly<{
  effective_from_year: number;
  effective_to_year: number | null;
  tier_order: number;
  tier_code: string;
  label: string;
  max_revenue_minor: string | null;
  rate_bps: number;
  law_reference: string;
  version?: string;
}>;

export type PolicyRow = Readonly<{
  organization_id: string;
  cit_small_enterprise_ineligible: boolean;
  ineligibility_reason: string | null;
  prior_year_revenue_override_minor: string | null;
  updated_by: string;
  updated_at: Date | string;
  version: string;
}>;

const amount = (value: unknown): bigint => BigInt(String(value ?? 0));

export function groupTierRowsToSchedules(
  rows: readonly TierRow[],
  source: "statutory" | "organization",
): readonly CitRateSchedule[] {
  const byYear = new Map<
    number,
    {
      effectiveToYear: number | null;
      lawReference: string;
      tiers: CitRateTier[];
    }
  >();
  for (const row of rows) {
    const current = byYear.get(row.effective_from_year) ?? {
      effectiveToYear: row.effective_to_year,
      lawReference: row.law_reference,
      tiers: [],
    };
    current.tiers.push({
      tierOrder: Number(row.tier_order),
      tierCode: row.tier_code,
      label: row.label,
      maxRevenueMinor: row.max_revenue_minor === null ? null : BigInt(row.max_revenue_minor),
      rateBps: Number(row.rate_bps),
    });
    byYear.set(row.effective_from_year, current);
  }
  const schedules: CitRateSchedule[] = [];
  for (const [effectiveFromYear, group] of byYear.entries()) {
    const sorted = [...group.tiers].sort((a, b) => a.tierOrder - b.tierOrder);
    const last = sorted[sorted.length - 1];
    if (!last) continue;
    schedules.push({
      effectiveFromYear,
      effectiveToYear: group.effectiveToYear,
      lawReference: group.lawReference,
      standardRateBps: last.rateBps,
      source,
      tiers: sorted,
    });
  }
  return schedules.sort((a, b) => b.effectiveFromYear - a.effectiveFromYear);
}

export function tierToContract(tier: CitRateTier): CitRateTierContract {
  return {
    tierOrder: tier.tierOrder,
    tierCode: tier.tierCode,
    label: tier.label,
    maxRevenueMinor: tier.maxRevenueMinor === null ? null : tier.maxRevenueMinor.toString(),
    rateBps: tier.rateBps,
  };
}

export function scheduleToContract(
  schedule: CitRateSchedule,
  version?: string,
): CitRateScheduleContract {
  return {
    effectiveFromYear: schedule.effectiveFromYear,
    effectiveToYear: schedule.effectiveToYear,
    lawReference: schedule.lawReference,
    standardRateBps: schedule.standardRateBps,
    source: schedule.source,
    ...(version ? { version } : {}),
    tiers: schedule.tiers.map(tierToContract),
  };
}

export async function loadCitSchedulesAndPolicy(db: Queryable, organizationId: string) {
  const [policyRes, orgTierRes, statutoryTierRes] = await Promise.all([
    db.query<PolicyRow>(
      `select organization_id,cit_small_enterprise_ineligible,ineligibility_reason,
              prior_year_revenue_override_minor::text,updated_by,updated_at,version::text
         from organization_cit_policies
        where organization_id=$1`,
      [organizationId],
    ),
    db.query<TierRow>(
      `select effective_from_year,effective_to_year,tier_order,tier_code,label,
              max_revenue_minor::text,rate_bps,law_reference,version::text
         from organization_cit_rate_tiers
        where organization_id=$1
        order by effective_from_year desc,tier_order asc`,
      [organizationId],
    ),
    db.query<TierRow>(
      `select effective_from_year,effective_to_year,tier_order,tier_code,label,
              max_revenue_minor::text,rate_bps,law_reference
         from statutory_cit_rate_tiers
        order by effective_from_year desc,tier_order asc`,
    ),
  ]);
  const orgSchedules = groupTierRowsToSchedules(orgTierRes.rows, "organization");
  const statutorySchedules = statutoryTierRes.rows.length
    ? groupTierRowsToSchedules(statutoryTierRes.rows, "statutory")
    : [LAW_67_2025_CIT_SCHEDULE];
  const versionByYear = new Map<number, string>();
  for (const row of orgTierRes.rows) {
    if (row.version && !versionByYear.has(row.effective_from_year)) {
      versionByYear.set(row.effective_from_year, row.version);
    }
  }
  return {
    policyRow: policyRes.rows[0] ?? null,
    orgSchedules,
    statutorySchedules,
    versionByYear,
  };
}

export async function resolvePgCitEstimate(
  db: Queryable,
  organizationId: string,
  input: Readonly<{
    startsOn: string;
    endsOn: string;
    asOf?: string;
    baseCurrency?: string;
    accountingRevenueMinor?: bigint;
    accountingExpenseMinor?: bigint;
    citIneligibleMinor?: bigint;
    citUnreviewedMinor?: bigint;
  }>,
): Promise<EstimatedCitReportContract> {
  let currency = input.baseCurrency;
  if (!currency) {
    const orgRes = await db.query<{ base_currency: string }>(
      `select base_currency from organizations where id=$1`,
      [organizationId],
    );
    if (!orgRes.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    currency = orgRes.rows[0].base_currency;
  }

  const taxYear = Number(input.endsOn.slice(0, 4));
  const priorYear = taxYear - 1;
  const priorStartsOn = `${priorYear}-01-01`;
  const priorEndsOn = `${priorYear}-12-31`;
  const yearStartsOn = `${taxYear}-01-01`;
  const effectiveAsOf = input.asOf ?? input.endsOn;

  const [loaded, priorRes, currentYearRes, fallbackTaxRes, periodRes] = await Promise.all([
    loadCitSchedulesAndPolicy(db, organizationId),
    db.query<{ prior_revenue: string; prior_journal_count: number }>(
      `select
         coalesce(sum(coalesce(l.credit_minor,0)-coalesce(l.debit_minor,0)) filter (where a.root_type='revenue'),0)::text prior_revenue,
         count(distinct j.id)::int prior_journal_count
       from journal_entries j
       join journal_lines l on l.organization_id=j.organization_id and l.journal_id=j.id
       join accounts a on a.organization_id=l.organization_id and a.code=l.account_code
      where j.organization_id=$1
        and j.state in ('posted','reversed')
        and j.currency=$2
        and j.journal_date between $3::date and $4::date`,
      [organizationId, currency, priorStartsOn, priorEndsOn],
    ),
    db.query<{ ytd_revenue: string }>(
      `select
         coalesce(sum(coalesce(l.credit_minor,0)-coalesce(l.debit_minor,0)) filter (where a.root_type='revenue'),0)::text ytd_revenue
       from journal_entries j
       join journal_lines l on l.organization_id=j.organization_id and l.journal_id=j.id
       join accounts a on a.organization_id=l.organization_id and a.code=l.account_code
      where j.organization_id=$1
        and j.state in ('posted','reversed')
        and j.currency=$2
        and j.journal_date between $3::date and $4::date`,
      [organizationId, currency, yearStartsOn, input.endsOn],
    ),
    db.query<{ rate_bps: number | null }>(
      `with workflow_policy as (
         select operating_mode from accounting_workflow_policies where organization_id=$1
       )
       select round(rate*10000)::int rate_bps
       from tax_code_versions
      where organization_id=$1 and kind='cit'
        and (review_state='accountant_approved' or coalesce((select operating_mode from workflow_policy),'controlled')='solopreneur')
        and effective_from<=$2::date and (effective_to is null or effective_to>=$2::date)
      order by (review_state='accountant_approved') desc,effective_from desc,code limit 1`,
      [organizationId, effectiveAsOf],
    ),
    input.accountingRevenueMinor !== undefined &&
    input.accountingExpenseMinor !== undefined &&
    input.citIneligibleMinor !== undefined &&
    input.citUnreviewedMinor !== undefined
      ? Promise.resolve(null)
      : db.query<{
          period_revenue: string;
          period_expense: string;
          cit_ineligible: string;
          cit_unreviewed: string;
        }>(
          `with ledger_totals as (
             select
               coalesce(sum(coalesce(l.credit_minor,0)-coalesce(l.debit_minor,0)) filter (where a.root_type='revenue'),0) period_revenue,
               coalesce(sum(coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0)) filter (where a.root_type='expense'),0) period_expense
             from journal_entries j
             join journal_lines l on l.organization_id=j.organization_id and l.journal_id=j.id
             join accounts a on a.organization_id=l.organization_id and a.code=l.account_code
            where j.organization_id=$1 and j.state in ('posted','reversed')
              and j.currency=$4
              and j.journal_date between $2::date and $3::date
           ),
           exp_tax as (
             select
               coalesce(sum(case
                 when l.cit_state='ineligible' then l.net_minor
                 when l.cit_state in ('partially_eligible','accountant_override') then greatest(l.net_minor - coalesce(l.cit_eligible_minor,0), 0)
                 else 0 end),0) ineligible,
               coalesce(sum(l.net_minor) filter (where l.cit_state='unreviewed'),0) unreviewed
             from expenses e
             join expense_lines l on l.organization_id=e.organization_id and l.expense_id=e.id
             join journal_entries j on j.organization_id=e.organization_id and j.id=e.journal_id
            where e.organization_id=$1 and e.state='posted' and e.currency=$4
              and e.expense_date between $2::date and $3::date
              and j.state in ('posted','reversed')
           ),
           doc_tax as (
             select
               coalesce(sum(case
                 when cl.cit_state='ineligible' then cl.net_minor
                 when cl.cit_state in ('partially_eligible','accountant_override') then greatest(cl.net_minor - coalesce(cl.cit_eligible_minor,0), 0)
                 else 0 end),0) ineligible,
               coalesce(sum(cl.net_minor) filter (where cl.cit_state='unreviewed'),0) unreviewed
             from commercial_documents cd
             join commercial_document_lines cl on cl.organization_id=cd.organization_id and cl.document_id=cd.id
            where cd.organization_id=$1 and cd.type='purchase_invoice' and cd.currency=$4
              and cd.state in ('issued','posted','partially_paid','paid')
              and cd.document_date between $2::date and $3::date
           )
           select
             (select period_revenue from ledger_totals)::text period_revenue,
             (select period_expense from ledger_totals)::text period_expense,
             ((select ineligible from exp_tax) + (select ineligible from doc_tax))::text cit_ineligible,
             ((select unreviewed from exp_tax) + (select unreviewed from doc_tax))::text cit_unreviewed`,
          [organizationId, input.startsOn, input.endsOn, currency],
        ),
  ]);

  const accountingRevenueMinor =
    input.accountingRevenueMinor ?? amount(periodRes?.rows[0]?.period_revenue);
  const accountingExpenseMinor =
    input.accountingExpenseMinor ?? amount(periodRes?.rows[0]?.period_expense);
  const citIneligibleMinor = input.citIneligibleMinor ?? amount(periodRes?.rows[0]?.cit_ineligible);
  const citUnreviewedMinor = input.citUnreviewedMinor ?? amount(periodRes?.rows[0]?.cit_unreviewed);
  const accountingProfitBeforeTaxMinor = accountingRevenueMinor - accountingExpenseMinor;
  const taxableProfitMinor = accountingProfitBeforeTaxMinor + citIneligibleMinor;

  const priorRevenueMinor = amount(priorRes.rows[0]?.prior_revenue);
  const hasPriorYearActivity = (priorRes.rows[0]?.prior_journal_count ?? 0) > 0;
  const currentYearRevenueMinor = amount(currentYearRes.rows[0]?.ytd_revenue);
  const policyRow = loaded.policyRow;

  const resolved = resolveEstimatedCit({
    taxYear,
    priorYearLedgerRevenueMinor: priorRevenueMinor,
    hasPriorYearActivity,
    currentYearRevenueMinor,
    taxableProfitMinor,
    citSmallEnterpriseIneligible: policyRow?.cit_small_enterprise_ineligible ?? false,
    ineligibilityReason: policyRow?.ineligibility_reason ?? null,
    priorYearRevenueOverrideMinor:
      policyRow?.prior_year_revenue_override_minor == null
        ? null
        : BigInt(policyRow.prior_year_revenue_override_minor),
    organizationSchedules: loaded.orgSchedules,
    statutorySchedules: loaded.statutorySchedules,
    fallbackTaxCodeRateBps: fallbackTaxRes.rows[0]?.rate_bps ?? null,
  });

  const status =
    citUnreviewedMinor > 0n ||
    resolved.effectiveRateBps === null ||
    resolved.basis === "no_prior_year_revenue"
      ? "review_required"
      : "ready";

  return {
    formulaVersion: resolved.formulaVersion,
    organizationId,
    currency,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    taxYear: resolved.taxYear,
    priorYear: resolved.priorYear,
    status,
    accountingRevenueMinor: accountingRevenueMinor.toString(),
    accountingExpenseMinor: accountingExpenseMinor.toString(),
    accountingProfitBeforeTaxMinor: accountingProfitBeforeTaxMinor.toString(),
    citIneligibleMinor: citIneligibleMinor.toString(),
    citUnreviewedMinor: citUnreviewedMinor.toString(),
    taxableProfitMinor: resolved.taxableProfitMinor.toString(),
    taxableBaseMinor: resolved.taxableBaseMinor.toString(),
    effectiveRateBps: resolved.effectiveRateBps,
    corporateIncomeTaxRateBps: resolved.effectiveRateBps,
    estimatedCitMinor:
      resolved.estimatedCitMinor === null ? null : resolved.estimatedCitMinor.toString(),
    tierCode: resolved.tierCode,
    basis: resolved.basis,
    assumption: resolved.assumption,
    lawReference: resolved.lawReference,
    scheduleSource: resolved.scheduleSource,
    referenceRevenueMinor:
      resolved.referenceRevenueMinor === null ? null : resolved.referenceRevenueMinor.toString(),
    priorYearLedgerRevenueMinor: resolved.priorYearLedgerRevenueMinor.toString(),
    hasPriorYearActivity: resolved.hasPriorYearActivity,
    currentYearRevenueMinor: resolved.currentYearRevenueMinor.toString(),
    citSmallEnterpriseIneligible: resolved.citSmallEnterpriseIneligible,
    ineligibilityReason: resolved.ineligibilityReason,
    priorYearRevenueOverrideMinor:
      resolved.priorYearRevenueOverrideMinor === null
        ? null
        : resolved.priorYearRevenueOverrideMinor.toString(),
    tiers: resolved.tiers.map(tierToContract),
  };
}
