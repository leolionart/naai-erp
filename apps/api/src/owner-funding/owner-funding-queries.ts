import type { PoolClient } from "pg";
import type {
  OwnerFundingLinkedRecordContract,
  OwnerFundingMovementContract,
  OwnerFundingMovementTypeContract,
} from "@naai-erp/contracts";
import type { OwnerFundingContext } from "./owner-funding.types.js";

export const SELECT_MOVEMENTS_SQL = `
  select m.id,
         m.movement_type,
         m.entry_mode,
         m.financial_account_id,
         fa.code financial_account_code,
         m.bank_transaction_id,
         m.journal_id,
         m.booking_date::text booking_date,
         m.amount_minor::text amount_minor,
         m.currency,
         m.reference,
         m.description,
         m.reason,
         m.created_by,
         m.created_at::text created_at,
         coalesce(linked.spend_minor, 0)::text linked_spend_minor,
         coalesce(linked.records, '[]'::jsonb) linked_records
    from owner_funding_movements m
    join financial_accounts fa
      on fa.organization_id = m.organization_id
     and fa.id = m.financial_account_id
    left join lateral (
      select coalesce(sum(item.gross_minor), 0) spend_minor,
             coalesce(
               jsonb_agg(
                 jsonb_build_object(
                   'kind', item.kind,
                   'id', item.id,
                   'date', item.item_date,
                   'grossMinor', item.gross_minor::text,
                   'currency', item.currency,
                   'state', item.state,
                   'description', item.description
                 )
                 order by item.item_date, item.kind, item.id
               ),
               '[]'::jsonb
             ) records
        from (
          select 'expense'::text kind,
                 e.id,
                 e.expense_date::text item_date,
                 e.gross_minor,
                 e.currency,
                 e.state::text state,
                 e.business_purpose description
            from expenses e
           where e.organization_id = m.organization_id
             and e.owner_funding_movement_id = m.id
             and e.state <> 'reversed'
          union all
          select 'purchase_invoice'::text kind,
                 d.id,
                 d.document_date::text item_date,
                 d.gross_minor,
                 d.currency,
                 d.state::text state,
                 d.document_number description
            from commercial_documents d
           where d.organization_id = m.organization_id
             and d.owner_funding_movement_id = m.id
             and d.state <> 'cancelled'
        ) item
    ) linked on true
`;

export type MovementRow = {
  id: string;
  movement_type: OwnerFundingMovementTypeContract;
  entry_mode: "bank_transaction" | "manual";
  financial_account_id: string;
  financial_account_code: string;
  bank_transaction_id: string;
  journal_id: string;
  booking_date: string;
  amount_minor: string;
  currency: string;
  reference: string | null;
  description: string;
  reason: string;
  created_by: string;
  created_at: string;
  linked_spend_minor: string;
  linked_records: OwnerFundingLinkedRecordContract[];
};

export function mapMovementRow(row: MovementRow): OwnerFundingMovementContract {
  return {
    id: row.id,
    movementId: row.id,
    movementType: row.movement_type,
    entryMode: row.entry_mode,
    financialAccountId: row.financial_account_id,
    financialAccountCode: row.financial_account_code,
    bankTransactionId: row.bank_transaction_id,
    journalId: row.journal_id,
    bookingDate: row.booking_date,
    amountMinor: row.amount_minor,
    currency: row.currency,
    reference: row.reference,
    description: row.description,
    reason: row.reason,
    linkedSpendMinor: row.linked_spend_minor,
    linkedRecords: Array.isArray(row.linked_records) ? row.linked_records : [],
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function requireActiveBankAccount(
  client: PoolClient,
  organizationId: string,
  financialAccountId: string,
  options?: { allowOwnerCustodyCash?: boolean },
) {
  const result = await client.query<{
    id: string;
    code: string;
    kind: string;
    status: string;
    currency: string;
    ledger_account_code: string;
  }>(
    `select id, code, kind::text kind, status::text status, currency, ledger_account_code
       from financial_accounts
      where organization_id = $1 and id = $2
      for update`,
    [organizationId, financialAccountId],
  );
  const account = result.rows[0];
  if (!account) throw new Error("FINANCIAL_ACCOUNT_NOT_FOUND");
  if (account.status !== "active") throw new Error("FINANCIAL_ACCOUNT_INACTIVE");
  const isOwnerCustodyCash =
    Boolean(options?.allowOwnerCustodyCash) &&
    account.kind === "cash" &&
    (account.code === "CASH-OWNER-CUSTODY" || account.ledger_account_code === "111-OWNER-CUSTODY");
  if (account.kind !== "bank" && !isOwnerCustodyCash) {
    throw new Error("OWNER_FUNDING_BANK_ACCOUNT_REQUIRED");
  }
  return account;
}

export async function resolveOwnerCurrentAccount(
  client: PoolClient,
  organizationId: string,
  bookingDate: string,
): Promise<string> {
  const ownerAccount = await client.query<{ account_code: string }>(
    `with selected_mapping as (
       select id, version from financial_statement_mapping_versions
        where organization_id = $1 and framework = 'TT133'
          and (state = 'approved' or exists (
            select 1 from accounting_workflow_policies w
             where w.organization_id = $1 and w.operating_mode = 'solopreneur'
          ))
          and effective_from <= $2::date
          and (effective_to is null or effective_to >= $2::date)
        order by (state = 'approved') desc, effective_from desc, version desc limit 1
     )
     select ml.account_code
       from selected_mapping sm
       join financial_statement_mapping_lines ml
         on ml.organization_id = $1 and ml.mapping_id = sm.id and ml.mapping_version = sm.version
       join accounts a on a.organization_id = ml.organization_id and a.code = ml.account_code
      where ml.statement = 'balance_sheet' and ml.line_code = 'owner_current' and a.is_active = true
      order by ml.account_code limit 2`,
    [organizationId, bookingDate],
  );
  if (ownerAccount.rows.length !== 1) throw new Error("OWNER_CURRENT_ACCOUNT_NOT_CONFIGURED");
  return ownerAccount.rows[0]!.account_code;
}

export async function assertPostingPeriodAllowed(
  client: PoolClient,
  context: OwnerFundingContext,
  postingDate: string,
) {
  const periods = await client.query<{ state: string }>(
    `select state from fiscal_periods
      where organization_id = $1 and $2::date between starts_on and ends_on
      order by fiscal_year, period_number limit 2`,
    [context.organizationId, postingDate],
  );
  if (periods.rows.length === 0) throw new Error("FISCAL_PERIOD_NOT_FOUND");
  if (periods.rows.length > 1) throw new Error("FISCAL_PERIOD_AMBIGUOUS");
  if (periods.rows[0]!.state === "hard_locked") throw new Error("PERIOD_HARD_LOCKED");
  if (periods.rows[0]!.state === "soft_locked") {
    const policy = await client.query<{ soft_lock_posting_roles: string[] }>(
      `select soft_lock_posting_roles from accounting_workflow_policies where organization_id = $1`,
      [context.organizationId],
    );
    const roles = policy.rows[0]?.soft_lock_posting_roles ?? ["owner", "finance_admin"];
    if (!context.roles.some((role) => roles.includes(role))) {
      throw new Error("PERIOD_SOFT_LOCKED");
    }
  }
}
