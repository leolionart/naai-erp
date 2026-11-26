import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg from "pg";
import type {
  OwnerFundingListContract,
  OwnerFundingMovementContract,
  OwnerFundingMovementTypeContract,
  RecordOwnerFundingResponseContract,
} from "@naai-erp/contracts";
import {
  assertPostingPeriodAllowed,
  mapMovementRow,
  requireActiveBankAccount,
  resolveOwnerCurrentAccount,
  SELECT_MOVEMENTS_SQL,
  type MovementRow,
} from "./owner-funding-queries.js";
import type {
  OwnerFundingContext,
  OwnerFundingListFilters,
  OwnerFundingStore,
  RecordOwnerFundingInput,
} from "./owner-funding.types.js";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const trimOrNull = (value: string | undefined | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

@Injectable()
export class PgOwnerFundingStore implements OwnerFundingStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  async list(
    organizationId: string,
    filters: OwnerFundingListFilters,
  ): Promise<OwnerFundingListContract> {
    const result = await this.pool.query<MovementRow>(
      `${SELECT_MOVEMENTS_SQL}
       where m.organization_id = $1
         and ($2::text is null or m.movement_type = $2)
         and ($3::text is null or m.financial_account_id = $3)
         and ($4::date is null or m.booking_date >= $4::date)
         and ($5::date is null or m.booking_date <= $5::date)
       order by m.booking_date desc, m.created_at desc, m.id`,
      [
        organizationId,
        filters.movementType ?? null,
        filters.financialAccountId ?? null,
        filters.from ?? null,
        filters.to ?? null,
      ],
    );
    let fundingTotal = 0n;
    let repaymentTotal = 0n;
    const items = result.rows.map((row) => {
      const amount = BigInt(row.amount_minor);
      if (row.movement_type === "owner_funding") fundingTotal += amount;
      else repaymentTotal += amount;
      return mapMovementRow(row);
    });
    return {
      items,
      summary: {
        ownerFundingMinor: fundingTotal.toString(),
        ownerRepaymentMinor: repaymentTotal.toString(),
        netOwnerBankFundingMinor: (fundingTotal - repaymentTotal).toString(),
      },
    };
  }

  async get(organizationId: string, id: string): Promise<OwnerFundingMovementContract | undefined> {
    const result = await this.pool.query<MovementRow>(
      `${SELECT_MOVEMENTS_SQL}
       where m.organization_id = $1 and m.id = $2`,
      [organizationId, id],
    );
    return result.rows[0] ? mapMovementRow(result.rows[0]) : undefined;
  }

  async record(
    context: OwnerFundingContext,
    input: RecordOwnerFundingInput & { movementType: OwnerFundingMovementTypeContract },
    idempotencyKey: string,
  ): Promise<RecordOwnerFundingResponseContract> {
    const canonicalRequest = {
      schemaVersion: 1,
      id: trimOrNull(input.id),
      movementType: input.movementType,
      bankTransactionId: trimOrNull(input.bankTransactionId),
      financialAccountId: trimOrNull(input.financialAccountId),
      bookingDate: input.bookingDate ?? null,
      amountMinor: input.amountMinor ? BigInt(input.amountMinor).toString() : null,
      currency: input.currency ?? null,
      reference: trimOrNull(input.reference),
      description: trimOrNull(input.description),
      reason: input.reason.trim(),
    };
    const requestHash = sha256(JSON.stringify(canonicalRequest));
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${context.organizationId}:${idempotencyKey}`,
      ]);
      const replay = await client.query<{
        request_hash: string;
        response_body: RecordOwnerFundingResponseContract;
      }>(
        `select request_hash, response_body from api_idempotency_records
         where organization_id = $1 and idempotency_key = $2 for update`,
        [context.organizationId, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
        await client.query("rollback");
        return { ...replay.rows[0].response_body, idempotencyReplayed: true };
      }

      const movementId = canonicalRequest.id ?? randomUUID();
      let entryMode: "bank_transaction" | "manual";
      let financialAccountId: string;
      let transactionId: string;
      let bookingDate: string;
      let amount: bigint;
      let currency: string;
      let reference: string | null;
      let description: string;
      let ledgerAccountCode: string;
      let priorTxState: string | null = null;

      if (canonicalRequest.bankTransactionId) {
        entryMode = "bank_transaction";
        const txRes = await client.query<{
          id: string;
          financial_account_id: string;
          booking_date: string;
          amount_minor: string;
          currency: string;
          reference: string | null;
          description: string;
          state: string;
        }>(
          `select id, financial_account_id, booking_date::text booking_date, amount_minor::text amount_minor,
                  currency, reference, description, state::text state
             from bank_transactions
            where organization_id = $1 and id = $2
            for update`,
          [context.organizationId, canonicalRequest.bankTransactionId],
        );
        const tx = txRes.rows[0];
        if (!tx) throw new Error("RESOURCE_NOT_FOUND");
        if (!["imported", "needs_review"].includes(tx.state)) {
          throw new Error("INVALID_BANK_TRANSACTION_TRANSITION");
        }
        const alreadyClaimed = await client.query(
          `select 1 from owner_funding_movements where organization_id = $1 and bank_transaction_id = $2
           union all
           select 1 from owner_cash_withdrawals where organization_id = $1 and bank_transaction_id = $2`,
          [context.organizationId, tx.id],
        );
        if (alreadyClaimed.rows.length > 0) {
          throw new Error("INVALID_BANK_TRANSACTION_TRANSITION");
        }
        const rawSigned = BigInt(tx.amount_minor);
        if (input.movementType === "owner_funding" && rawSigned <= 0n) {
          throw new Error("OWNER_FUNDING_DIRECTION_INVALID");
        }
        if (input.movementType === "owner_repayment" && rawSigned >= 0n) {
          throw new Error("OWNER_FUNDING_DIRECTION_INVALID");
        }
        amount = rawSigned < 0n ? -rawSigned : rawSigned;
        if (
          (canonicalRequest.financialAccountId &&
            canonicalRequest.financialAccountId !== tx.financial_account_id) ||
          (canonicalRequest.bookingDate && canonicalRequest.bookingDate !== tx.booking_date) ||
          (canonicalRequest.amountMinor && BigInt(canonicalRequest.amountMinor) !== amount) ||
          (canonicalRequest.currency && canonicalRequest.currency !== tx.currency)
        ) {
          throw new Error("OWNER_FUNDING_TRANSACTION_MISMATCH");
        }
        const account = await requireActiveBankAccount(
          client,
          context.organizationId,
          tx.financial_account_id,
        );
        financialAccountId = tx.financial_account_id;
        transactionId = tx.id;
        bookingDate = tx.booking_date;
        currency = tx.currency;
        reference = canonicalRequest.reference ?? tx.reference;
        description = canonicalRequest.description ?? tx.description;
        ledgerAccountCode = account.ledger_account_code;
        priorTxState = tx.state;
      } else {
        entryMode = "manual";
        const account = await requireActiveBankAccount(
          client,
          context.organizationId,
          canonicalRequest.financialAccountId!,
        );
        currency = canonicalRequest.currency ?? account.currency;
        if (currency !== account.currency) throw new Error("BANK_TRANSACTION_CURRENCY_MISMATCH");
        financialAccountId = account.id;
        transactionId = randomUUID();
        bookingDate = canonicalRequest.bookingDate!;
        amount = BigInt(canonicalRequest.amountMinor!);
        reference = canonicalRequest.reference!;
        description = canonicalRequest.description!;
        ledgerAccountCode = account.ledger_account_code;
      }

      await assertPostingPeriodAllowed(client, context, bookingDate);
      const ownerAccountCode = await resolveOwnerCurrentAccount(
        client,
        context.organizationId,
        bookingDate,
      );

      const eventId = randomUUID();
      if (entryMode === "manual") {
        const signedMinor = input.movementType === "owner_funding" ? amount : -amount;
        const fingerprint = sha256(
          JSON.stringify([
            `manual_${input.movementType}`,
            movementId,
            financialAccountId,
            bookingDate,
            signedMinor.toString(),
            currency,
            reference,
          ]),
        );
        await client.query(
          `insert into bank_transactions
             (organization_id, id, financial_account_id, fingerprint, booking_date, amount_minor,
              currency, reference, description, counterparty_name, state)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, null, 'reconciled')`,
          [
            context.organizationId,
            transactionId,
            financialAccountId,
            fingerprint,
            bookingDate,
            signedMinor.toString(),
            currency,
            reference,
            description,
          ],
        );
      } else {
        await client.query(
          `update bank_transactions
              set state = 'reconciled',
                  reference = coalesce($3, reference),
                  version = version + 1,
                  updated_at = now()
            where organization_id = $1 and id = $2`,
          [context.organizationId, transactionId, reference],
        );
      }

      const journalId = randomUUID();
      await client.query(
        `insert into journal_entries
           (organization_id, id, journal_date, description, currency, state, version, created_by,
            approved_at, approved_by, approval_reason, posted_at, posted_by)
         values ($1, $2, $3, $4, $5, 'posted', 2, $6, now(), $6, $7, now(), $6)`,
        [
          context.organizationId,
          journalId,
          bookingDate,
          description,
          currency,
          context.actorId,
          canonicalRequest.reason,
        ],
      );
      const debitAccount =
        input.movementType === "owner_funding" ? ledgerAccountCode : ownerAccountCode;
      const creditAccount =
        input.movementType === "owner_funding" ? ownerAccountCode : ledgerAccountCode;
      await client.query(
        `insert into journal_lines
           (organization_id, journal_id, line_number, account_code, debit_minor, credit_minor, description, dimensions)
         values ($1, $2, 1, $3, $4, null, $5, '{}'),
                ($1, $2, 2, $6, null, $4, $5, '{}')`,
        [
          context.organizationId,
          journalId,
          debitAccount,
          amount.toString(),
          description,
          creditAccount,
        ],
      );

      await client.query(
        `insert into owner_funding_movements
           (organization_id, id, movement_type, entry_mode, financial_account_id, bank_transaction_id,
            journal_id, booking_date, amount_minor, currency, reference, description, reason,
            created_by, correlation_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          context.organizationId,
          movementId,
          input.movementType,
          entryMode,
          financialAccountId,
          transactionId,
          journalId,
          bookingDate,
          amount.toString(),
          currency,
          reference,
          description,
          canonicalRequest.reason,
          context.actorId,
          context.correlationId,
        ],
      );

      const actionLabel =
        input.movementType === "owner_funding" ? "record-owner-funding" : "record-owner-repayment";
      await client.query(
        `insert into bank_transaction_events
           (organization_id, id, transaction_id, action, from_state, to_state, actor_id, reason, correlation_id, details)
         values ($1, $2, $3, $4, $5::bank_transaction_state, 'reconciled', $6, $7, $8, $9)`,
        [
          context.organizationId,
          eventId,
          transactionId,
          actionLabel,
          priorTxState,
          context.actorId,
          canonicalRequest.reason,
          context.correlationId,
          { movementId, movementType: input.movementType, journalId },
        ],
      );

      const auditEventId = randomUUID();
      const outboxEventId = randomUUID();
      const afterState = {
        movementId,
        movementType: input.movementType,
        entryMode,
        financialAccountId,
        transactionId,
        journalId,
        bookingDate,
        amountMinor: amount.toString(),
        currency,
        reference,
        status: "posted" as const,
      };
      await client.query(
        `insert into resource_audit_events
           (organization_id, id, resource_type, resource_key, resource_version, action, actor_id,
            correlation_id, before_state, after_state)
         values ($1, $2, 'owner_funding_movement', $3, '1', 'create', $4, $5, null, $6)`,
        [
          context.organizationId,
          auditEventId,
          movementId,
          context.actorId,
          context.correlationId,
          afterState,
        ],
      );
      await client.query(
        `insert into outbox_events
           (organization_id, id, aggregate_type, aggregate_id, event_type, schema_version, payload, correlation_id)
         values ($1, $2, 'owner_funding_movement', $3, $4, 1, $5, $6)`,
        [
          context.organizationId,
          outboxEventId,
          movementId,
          `${input.movementType}.recorded`,
          afterState,
          context.correlationId,
        ],
      );

      const response: RecordOwnerFundingResponseContract = {
        ...afterState,
        resourceVersion: "1",
        eventId,
        auditEventId,
        outboxEventId,
        idempotencyReplayed: false,
        nextActions: [
          "get_owner_funding",
          "list_owner_funding",
          "list_owner_current_movements",
          "get_journal",
        ],
      };
      await client.query(
        `insert into api_idempotency_records
           (organization_id, idempotency_key, operation, request_hash, response_body)
         values ($1, $2, $3, $4, $5)`,
        [
          context.organizationId,
          idempotencyKey,
          `banking:${input.movementType}:record`,
          requestHash,
          response,
        ],
      );
      await client.query("commit");
      return response;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
