import type { Pool, PoolClient } from "pg";

export type OwnerFundingTraceabilityResolution = Readonly<{
  movementId: string;
  bankTransactionId: string;
  financialAccountId: string;
  ledgerAccountCode: string;
  currency: string;
}>;

export async function resolveOwnerFundingTraceability(
  db: Pick<Pool | PoolClient, "query">,
  organizationId: string,
  input: {
    ownerFundingId?: string | null | undefined;
    ownerFundingTransactionId?: string | null | undefined;
    fundingType?: string | null | undefined;
    fundingFinancialAccountId?: string | null | undefined;
    accountCode?: string | null | undefined;
    currency?: string | null | undefined;
  },
): Promise<OwnerFundingTraceabilityResolution | undefined> {
  const movementId = input.ownerFundingId?.trim() || null;
  const txId = input.ownerFundingTransactionId?.trim() || null;
  if (!movementId && !txId) return undefined;

  if (input.fundingType && input.fundingType !== "company_bank") {
    throw new Error("OWNER_FUNDING_ACCOUNT_MISMATCH");
  }

  const result = await db.query<{
    id: string;
    movement_type: string;
    financial_account_id: string;
    bank_transaction_id: string;
    currency: string;
    ledger_account_code: string;
    account_kind: string;
  }>(
    `select m.id,
            m.movement_type,
            m.financial_account_id,
            m.bank_transaction_id,
            m.currency,
            fa.ledger_account_code,
            fa.kind::text account_kind
       from owner_funding_movements m
       join financial_accounts fa
         on fa.organization_id = m.organization_id
        and fa.id = m.financial_account_id
      where m.organization_id = $1
        and ($2::text is null or m.id = $2)
        and ($3::text is null or m.bank_transaction_id = $3)
      limit 2`,
    [organizationId, movementId, txId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("OWNER_FUNDING_NOT_FOUND");
  if (row.movement_type !== "owner_funding") {
    throw new Error("OWNER_FUNDING_LINK_INVALID");
  }
  if (row.account_kind !== "bank") {
    throw new Error("OWNER_FUNDING_ACCOUNT_MISMATCH");
  }
  if (
    input.fundingFinancialAccountId &&
    input.fundingFinancialAccountId !== row.financial_account_id
  ) {
    throw new Error("OWNER_FUNDING_ACCOUNT_MISMATCH");
  }
  if (input.accountCode && input.accountCode !== row.ledger_account_code) {
    throw new Error("OWNER_FUNDING_ACCOUNT_MISMATCH");
  }
  if (input.currency && input.currency !== row.currency) {
    throw new Error("OWNER_FUNDING_ACCOUNT_MISMATCH");
  }
  return {
    movementId: row.id,
    bankTransactionId: row.bank_transaction_id,
    financialAccountId: row.financial_account_id,
    ledgerAccountCode: row.ledger_account_code,
    currency: row.currency,
  };
}
