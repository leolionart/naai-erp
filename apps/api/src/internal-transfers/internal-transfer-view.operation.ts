import type pg from "pg";
import { type PoolClient } from "pg";
import type { PgInternalTransferStore } from "./pg-internal-transfer.store.js";

export async function viewOperation(
  this: PgInternalTransferStore,
  q: Pick<PoolClient, "query"> | pg.Pool,
  org: string,
  id: string,
) {
  const p = await q.query<{
    id: string;
    state: string;
    currency: string;
    transfer_amount_minor: string;
    base_principal_amount_minor: string;
    transit_account_code: string;
    current_attempt_number: number;
    version: string;
  }>(
    "select id,state,currency,transfer_amount_minor::text,base_principal_amount_minor::text,transit_account_code,current_attempt_number,version::text from internal_transfers where organization_id=$1 and id=$2",
    [org, id],
  );
  if (!p.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
  const a = await q.query<{
    attempt_number: number;
    state: string;
    posting_mode: string;
    fee: Record<string, unknown> | null;
    outgoing_transaction_id: string | null;
    incoming_transaction_id: string | null;
    outgoing_journal_id: string | null;
    incoming_journal_id: string | null;
    outgoing_reversal_journal_id: string | null;
    incoming_reversal_journal_id: string | null;
    fee_reversal_journal_id: string | null;
  }>(
    "select attempt_number,state,posting_mode,fee,outgoing_transaction_id,incoming_transaction_id,outgoing_journal_id,incoming_journal_id,outgoing_reversal_journal_id,incoming_reversal_journal_id,fee_reversal_journal_id from internal_transfer_attempts where organization_id=$1 and transfer_id=$2 order by attempt_number",
    [org, id],
  );
  const attempts = [] as Record<string, unknown>[];
  for (const x of a.rows) {
    const legs = await q.query<{
      id: string;
      amount_minor: string;
      currency: string;
      booking_date: string;
      financial_account_id: string;
      ledger_account_code: string;
    }>(
      `select b.id,b.amount_minor::text,b.currency,b.booking_date::text,b.financial_account_id,f.ledger_account_code from bank_transactions b join financial_accounts f on f.organization_id=b.organization_id and f.id=b.financial_account_id where b.organization_id=$1 and b.id=any($2::text[])`,
      [org, [x.outgoing_transaction_id, x.incoming_transaction_id].filter(Boolean)],
    );
    const source = legs.rows.find((l) => l.id === x.outgoing_transaction_id),
      destination = legs.rows.find((l) => l.id === x.incoming_transaction_id);
    attempts.push({
      attemptNumber: x.attempt_number,
      state: x.state,
      postingMode: x.posting_mode,
      transitAccountId: p.rows[0].transit_account_code,
      ...(source
        ? {
            source: {
              role: "source",
              transactionId: source.id,
              financialAccountId: source.financial_account_id,
              ledgerAccountId: source.ledger_account_code,
              statementAmountMinor: (-BigInt(source.amount_minor)).toString(),
              principalAmountMinor: p.rows[0].transfer_amount_minor,
              baseAmountMinor: p.rows[0].base_principal_amount_minor,
              currency: source.currency,
              bookingDate: source.booking_date,
              ...(x.outgoing_journal_id ? { journalId: x.outgoing_journal_id } : {}),
            },
          }
        : {}),
      ...(destination
        ? {
            destination: {
              role: "destination",
              transactionId: destination.id,
              financialAccountId: destination.financial_account_id,
              ledgerAccountId: destination.ledger_account_code,
              statementAmountMinor: destination.amount_minor,
              principalAmountMinor: p.rows[0].transfer_amount_minor,
              baseAmountMinor: p.rows[0].base_principal_amount_minor,
              currency: destination.currency,
              bookingDate: destination.booking_date,
              ...((x.incoming_journal_id ??
              (x.posting_mode === "direct" ? x.outgoing_journal_id : null))
                ? { journalId: x.incoming_journal_id ?? x.outgoing_journal_id }
                : {}),
            },
          }
        : {}),
      ...(x.fee ? { fee: x.fee } : {}),
      journalIds: [
        ...new Set(
          [
            x.outgoing_journal_id,
            x.incoming_journal_id,
            x.fee?.journalId as string | undefined,
          ].filter((value): value is string => Boolean(value)),
        ),
      ],
      reversalJournalIds: [
        ...new Set(
          [
            x.outgoing_reversal_journal_id,
            x.incoming_reversal_journal_id,
            x.fee_reversal_journal_id,
          ].filter((value): value is string => Boolean(value)),
        ),
      ],
    });
  }
  return {
    id: p.rows[0].id,
    state: p.rows[0].state,
    currency: p.rows[0].currency,
    principalAmountMinor: p.rows[0].transfer_amount_minor,
    basePrincipalAmountMinor: p.rows[0].base_principal_amount_minor,
    currentAttemptNumber: p.rows[0].current_attempt_number,
    attempts,
    transitOutstandingMinor:
      p.rows[0].state === "pending_counterpart" ? p.rows[0].transfer_amount_minor : "0",
    resourceVersion: p.rows[0].version,
    nextActions:
      p.rows[0].state === "pending_counterpart"
        ? ["match", "unmatch"]
        : p.rows[0].state === "matched" || p.rows[0].state === "reconciled"
          ? ["unmatch"]
          : [],
  };
}
