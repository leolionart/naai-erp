import type { Pool, PoolClient } from "pg";
import type { NegativeCustodyAlertContract } from "@naai-erp/contracts";
import type { ActorContext } from "../master-data/master-data.types.js";

const SOFT_LOCK_ROLES = new Set(["owner", "finance_admin"]);

export function buildNegativeCustodyAlert(
  balanceMinor: bigint,
  custodyAccountCode = "111-OWNER-CUSTODY",
): NegativeCustodyAlertContract | null {
  if (balanceMinor >= 0n) return null;
  const deficitMinor = (-balanceMinor).toString();
  return {
    isNegative: true,
    custodyAccountCode,
    balanceMinor: balanceMinor.toString(),
    deficitMinor,
    suggestedTargetFunding: "owner_paid",
    message: `Số dư quỹ tiền mặt do chủ giữ (${custodyAccountCode}) đang âm (${balanceMinor.toString()} VND). Đề xuất phân loại lại phần chi vượt (${deficitMinor} VND) sang Chủ chi hộ (owner_paid - TK 3388).`,
    actionHref: "/expenses",
  };
}

export async function assertClosePostingPeriodAllowed(
  client: PoolClient,
  context: ActorContext,
  bookingDate: string,
): Promise<void> {
  const periods = await client.query<{ state: string }>(
    `select state::text state
       from fiscal_periods
      where organization_id = $1
        and starts_on <= $2::date
        and ends_on >= $2::date`,
    [context.organizationId, bookingDate],
  );
  if (periods.rows.length === 0) throw new Error("FISCAL_PERIOD_NOT_FOUND");
  if (periods.rows.length > 1) throw new Error("FISCAL_PERIOD_AMBIGUOUS");
  const state = periods.rows[0]!.state;
  if (state === "hard_locked") throw new Error("PERIOD_HARD_LOCKED");
  if (state === "soft_locked" && !context.roles.some((role) => SOFT_LOCK_ROLES.has(role))) {
    throw new Error("PERIOD_SOFT_LOCKED");
  }
}

export async function resolveCustodyAccountCode(
  db: Pool | PoolClient,
  organizationId: string,
): Promise<string> {
  const res = await db.query<{ code: string }>(
    `select code from accounts
      where organization_id = $1 and is_active = true and root_type = 'asset'
        and code = '111-OWNER-CUSTODY'
      union all
      select fa.ledger_account_code as code
        from financial_accounts fa
        join accounts a on a.organization_id = fa.organization_id and a.code = fa.ledger_account_code
       where fa.organization_id = $1 and fa.status = 'active' and fa.code = 'CASH-OWNER-CUSTODY'
         and a.is_active = true and fa.ledger_account_code not in ('111', '111-CASH')
      limit 1`,
    [organizationId],
  );
  const code = res.rows[0]?.code;
  if (!code) throw new Error("CASH_COUNT_CUSTODY_ACCOUNT_NOT_CONFIGURED");
  return code;
}

export async function readLedgerAccountBalanceMinor(
  db: Pool | PoolClient,
  organizationId: string,
  accountCodes: readonly string[],
  asOf: string,
  normalSide: "debit" | "credit",
): Promise<bigint> {
  if (accountCodes.length === 0) return 0n;
  const expr =
    normalSide === "debit"
      ? "sum(coalesce(l.debit_minor, 0) - coalesce(l.credit_minor, 0))"
      : "sum(coalesce(l.credit_minor, 0) - coalesce(l.debit_minor, 0))";
  const res = await db.query<{ bal: string }>(
    `select coalesce(${expr}, 0)::text as bal
       from journal_entries j
       join journal_lines l on l.organization_id = j.organization_id and l.journal_id = j.id
      where j.organization_id = $1
        and j.state in ('posted', 'reversed')
        and j.journal_date <= $2::date
        and l.account_code = any($3::text[])`,
    [organizationId, asOf, [...accountCodes]],
  );
  return BigInt(res.rows[0]?.bal ?? "0");
}

export async function resolveCashAdjustmentAccount(
  client: PoolClient,
  organizationId: string,
  differenceMinor: bigint,
  explicitCode?: string,
): Promise<string> {
  if (explicitCode?.trim()) {
    const code = explicitCode.trim();
    if (["111", "111-CASH", "111-OWNER-CUSTODY"].includes(code)) {
      throw new Error("CASH_COUNT_ADJUSTMENT_ACCOUNT_INVALID");
    }
    const found = await client.query<{ code: string }>(
      `select code from accounts
        where organization_id = $1 and code = $2 and is_active = true and is_control_account = false`,
      [organizationId, code],
    );
    if (!found.rows[0]) throw new Error("CASH_COUNT_ADJUSTMENT_ACCOUNT_INVALID");
    return found.rows[0].code;
  }

  const candidates =
    differenceMinor > 0n
      ? ["711-CASH-OVER", "711", "3381", "515-OTHER"]
      : ["811-CASH-SHORT", "811", "1381", "635-OTHER"];
  const lineCode = differenceMinor > 0n ? "other_income" : "other_expense";

  const found = await client.query<{ code: string }>(
    `with preferred as (
       select a.code, array_position($2::text[], a.code) as ord
         from accounts a
        where a.organization_id = $1 and a.is_active = true and a.is_control_account = false
          and a.code = any($2::text[])
       union all
       select ml.account_code as code, 100 + ml.display_order as ord
         from financial_statement_mapping_versions mv
         join financial_statement_mapping_lines ml
           on ml.organization_id = mv.organization_id and ml.mapping_id = mv.id and ml.mapping_version = mv.version
         join accounts a
           on a.organization_id = ml.organization_id and a.code = ml.account_code
        where mv.organization_id = $1 and ml.statement = 'profit_and_loss' and ml.line_code = $3
          and a.is_active = true and a.is_control_account = false
     )
     select code from preferred order by ord asc limit 1`,
    [organizationId, candidates, lineCode],
  );
  if (!found.rows[0]?.code) throw new Error("CASH_COUNT_ADJUSTMENT_ACCOUNT_INVALID");
  return found.rows[0].code;
}

export type OwnerPositionSnapshot = Readonly<{
  currency: string;
  payable3388AccountCode: string;
  receivable1388AccountCode: string;
  custody111AccountCode: string;
  retainedEarnings421AccountCode: string;
  payable3388Minor: bigint;
  receivable1388Minor: bigint;
  ownerCustody111Minor: bigint;
  retainedEarnings421Minor: bigint;
  unclosedProfitMinor: bigint;
  netOwnerPositionMinor: bigint;
}>;

export async function resolveOwnerPositionSnapshot(
  db: Pool | PoolClient,
  organizationId: string,
  asOf: string,
): Promise<OwnerPositionSnapshot> {
  const orgRes = await db.query<{ base_currency: string }>(
    `select base_currency from organizations where id = $1`,
    [organizationId],
  );
  if (!orgRes.rows[0]) throw new Error("RESOURCE_NOT_FOUND");

  const accountsRes = await db.query<{
    bucket: "owner_3388" | "owner_1388" | "custody_111" | "retained_421";
    account_code: string;
    signed_minor: string;
    ord: number;
  }>(
    `with workflow_policy as (
       select operating_mode from accounting_workflow_policies where organization_id = $1
     ), selected_mapping as (
       select id, version
         from financial_statement_mapping_versions
        where organization_id = $1 and framework = 'TT133'
          and (state = 'approved' or coalesce((select operating_mode from workflow_policy), 'controlled') = 'solopreneur')
          and effective_from <= $2::date and (effective_to is null or effective_to >= $2::date)
        order by (state = 'approved') desc, effective_from desc, version desc limit 1
     ), candidate_accounts as (
       select 'owner_3388'::text as bucket, ml.account_code, 1 as ord
         from selected_mapping sm
         join financial_statement_mapping_lines ml
           on ml.organization_id = $1 and ml.mapping_id = sm.id and ml.mapping_version = sm.version
        where ml.statement = 'balance_sheet' and ml.line_code = 'owner_current'
       union
       select 'owner_3388', a.code, 2 from accounts a
        where a.organization_id = $1 and a.is_active = true and a.root_type = 'liability'
          and (a.code = '3388' or a.code like '3388-%') and a.code <> '3389-BANK-CLEAR'
       union
       select 'owner_1388', a.code, case when a.code = '1388-OWNER' then 1 else 2 end
         from accounts a
        where a.organization_id = $1 and a.is_active = true and a.root_type = 'asset'
          and a.code in ('1388-OWNER', '1388')
       union
       select 'owner_1388', e.child_code, 3
         from account_hierarchy_edges e
        where e.organization_id = $1 and e.parent_code = '1388' and e.child_root_type = 'asset'
          and e.child_code <> '1388-TRANSIT'
       union
       select 'owner_1388', ml.account_code, 4
         from selected_mapping sm
         join financial_statement_mapping_lines ml
           on ml.organization_id = $1 and ml.mapping_id = sm.id and ml.mapping_version = sm.version
        where ml.statement = 'balance_sheet' and ml.line_code = 'owner_receivable'
       union
       select 'custody_111', a.code, 1
         from accounts a
        where a.organization_id = $1 and a.root_type = 'asset' and a.code = '111-OWNER-CUSTODY'
       union
       select 'retained_421', ml.account_code, 1
         from selected_mapping sm
         join financial_statement_mapping_lines ml
           on ml.organization_id = $1 and ml.mapping_id = sm.id and ml.mapping_version = sm.version
        where ml.statement = 'balance_sheet' and ml.line_code = 'retained_earnings'
       union
       select 'retained_421', a.code, case when a.code = '421-RE' then 2 else 3 end
         from accounts a
        where a.organization_id = $1 and a.is_active = true and a.root_type = 'equity'
          and (a.code = '421' or a.code like '421-%' or a.code like '4211%' or a.code like '4212%')
     )
     select
       ca.bucket,
       ca.account_code,
       min(ca.ord)::int as ord,
       coalesce((
         select case
                  when ca.bucket in ('owner_3388', 'retained_421')
                    then sum(coalesce(l.credit_minor, 0) - coalesce(l.debit_minor, 0))
                  else sum(coalesce(l.debit_minor, 0) - coalesce(l.credit_minor, 0))
                end
           from journal_entries j
           join journal_lines l on l.organization_id = j.organization_id and l.journal_id = j.id
          where j.organization_id = $1
            and j.state in ('posted', 'reversed')
            and j.journal_date <= $2::date
            and l.account_code = ca.account_code
       ), 0)::text as signed_minor
     from candidate_accounts ca
     group by ca.bucket, ca.account_code`,
    [organizationId, asOf],
  );

  const pickBucket = (bucket: "owner_3388" | "owner_1388" | "custody_111" | "retained_421") => {
    const rows = accountsRes.rows
      .filter((r) => r.bucket === bucket)
      .sort((a, b) => {
        const ba = BigInt(a.signed_minor);
        const bb = BigInt(b.signed_minor);
        if (ba > 0n && bb <= 0n) return -1;
        if (bb > 0n && ba <= 0n) return 1;
        if (ba !== bb) return bb > ba ? 1 : -1;
        return a.ord - b.ord;
      });
    const total = rows.reduce((sum, r) => sum + BigInt(r.signed_minor), 0n);
    return { code: rows[0]?.account_code ?? "", total };
  };

  const p3388 = pickBucket("owner_3388");
  const r1388 = pickBucket("owner_1388");
  const c111 = pickBucket("custody_111");
  const re421 = pickBucket("retained_421");

  const pnlRes = await db.query<{ unclosed: string }>(
    `select coalesce(
       sum(coalesce(l.credit_minor, 0) - coalesce(l.debit_minor, 0)) filter (where a.root_type = 'revenue'), 0
     ) - coalesce(
       sum(coalesce(l.debit_minor, 0) - coalesce(l.credit_minor, 0)) filter (where a.root_type = 'expense'), 0
     ) as unclosed
       from journal_entries j
       join journal_lines l on l.organization_id = j.organization_id and l.journal_id = j.id
       join accounts a on a.organization_id = l.organization_id and a.code = l.account_code
      where j.organization_id = $1
        and j.state in ('posted', 'reversed')
        and j.currency = $3
        and j.journal_date <= $2::date`,
    [organizationId, asOf, orgRes.rows[0].base_currency],
  );

  const payable3388Minor = p3388.total > 0n ? p3388.total : 0n;
  const receivable1388Minor = r1388.total > 0n ? r1388.total : 0n;

  return {
    currency: orgRes.rows[0].base_currency,
    payable3388AccountCode: p3388.code || "3388-OWNER",
    receivable1388AccountCode: r1388.code || "1388-OWNER",
    custody111AccountCode: c111.code || "111-OWNER-CUSTODY",
    retainedEarnings421AccountCode: re421.code || "421-RE",
    payable3388Minor,
    receivable1388Minor,
    ownerCustody111Minor: c111.total,
    retainedEarnings421Minor: re421.total,
    unclosedProfitMinor: BigInt(pnlRes.rows[0]?.unclosed ?? "0"),
    netOwnerPositionMinor: p3388.total - r1388.total,
  };
}
