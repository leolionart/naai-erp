import { randomUUID } from "node:crypto";
import type {
  InternalTransferContext,
  MatchInternalTransferInput,
  UnmatchInternalTransferInput,
} from "./internal-transfer.types.js";
import { type Tx } from "./pg-internal-transfer.store.shared.js";
import type { PgInternalTransferStore } from "./pg-internal-transfer.store.js";

export async function matchOperation(
  this: PgInternalTransferStore,
  context: InternalTransferContext,
  id: string,
  input: MatchInternalTransferInput,
  key: string,
) {
  return this.mutate(context, key, "internal-transfer:match", { id, input }, async (c) => {
    const parent = await c.query<{
      version: string;
      currency: string;
      transfer_amount_minor: string;
      transit_account_code: string;
      current_attempt_number: number;
    }>(
      "select version::text,currency,transfer_amount_minor::text,transit_account_code,current_attempt_number from internal_transfers where organization_id=$1 and id=$2 for update",
      [context.organizationId, id],
    );
    if (!parent.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    if (input.expectedResourceVersion !== parent.rows[0].version)
      throw new Error("VERSION_CONFLICT");
    const attempt = await c.query<{
      id: string;
      outgoing_transaction_id: string | null;
      incoming_transaction_id: string | null;
      outgoing_journal_id: string | null;
      incoming_journal_id: string | null;
      fee_transaction_id: string | null;
      fee: Record<string, unknown> | null;
      posting_mode: string;
    }>(
      "select id,outgoing_transaction_id,incoming_transaction_id,outgoing_journal_id,incoming_journal_id,fee_transaction_id,fee,posting_mode from internal_transfer_attempts where organization_id=$1 and transfer_id=$2 and attempt_number=$3 and state='pending_counterpart' for update",
      [context.organizationId, id, parent.rows[0].current_attempt_number],
    );
    if (!attempt.rows[0]) throw new Error("INTERNAL_TRANSFER_NOT_PENDING");
    const existingId =
      attempt.rows[0].outgoing_transaction_id ?? attempt.rows[0].incoming_transaction_id!;
    const ordered = [existingId, input.counterpartTransactionId, attempt.rows[0].fee_transaction_id]
      .filter((value): value is string => Boolean(value))
      .sort();
    const locked = new Map<string, Tx>();
    for (const txId of ordered)
      locked.set(txId, await this.lockTx(c, context.organizationId, txId));
    const existing = locked.get(existingId)!,
      counter = locked.get(input.counterpartTransactionId)!;
    this.available(counter);
    if (existing.financial_account_id === counter.financial_account_id)
      throw new Error("INTERNAL_TRANSFER_SAME_ACCOUNT");
    if (existing.currency !== counter.currency)
      throw new Error("INTERNAL_TRANSFER_CURRENCY_MISMATCH");
    if (
      (BigInt(counter.amount_minor) < 0n
        ? -BigInt(counter.amount_minor)
        : BigInt(counter.amount_minor)) !== BigInt(parent.rows[0].transfer_amount_minor)
    )
      throw new Error("INTERNAL_TRANSFER_AMOUNT_MISMATCH");
    const counterOutgoing = BigInt(counter.amount_minor) < 0n;
    if (
      (counterOutgoing && attempt.rows[0].outgoing_transaction_id) ||
      (!counterOutgoing && attempt.rows[0].incoming_transaction_id)
    )
      throw new Error("INTERNAL_TRANSFER_DIRECTION_INVALID");
    const journalId = await this.postLeg(
      c,
      context,
      counter,
      parent.rows[0].transit_account_code,
      id,
    );
    const nextAttempt = parent.rows[0].current_attempt_number + 1;
    await c.query(
      `insert into internal_transfer_attempts(organization_id,id,transfer_id,attempt_number,state,posting_mode,fee,outgoing_transaction_id,incoming_transaction_id,fee_transaction_id,outgoing_journal_id,incoming_journal_id,manual_override_reason,matched_by,matched_at,correlation_id,created_by)values($1,$2,$3,$4,'reconciled',$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),$14,$13)`,
      [
        context.organizationId,
        randomUUID(),
        id,
        nextAttempt,
        attempt.rows[0].posting_mode,
        attempt.rows[0].fee,
        counterOutgoing ? counter.id : attempt.rows[0].outgoing_transaction_id,
        counterOutgoing ? attempt.rows[0].incoming_transaction_id : counter.id,
        attempt.rows[0].fee_transaction_id,
        counterOutgoing ? journalId : attempt.rows[0].outgoing_journal_id,
        counterOutgoing ? attempt.rows[0].incoming_journal_id : journalId,
        input.reason.trim(),
        context.actorId,
        context.correlationId,
      ],
    );
    await c.query(
      "insert into internal_transfer_claims(organization_id,bank_transaction_id,transfer_id,attempt_number,role)values($1,$2,$3,$4,$5)",
      [
        context.organizationId,
        counter.id,
        id,
        nextAttempt,
        counterOutgoing ? "source" : "destination",
      ],
    );
    await c.query(
      "update internal_transfers set state='reconciled',current_attempt_number=$3,version=version+1,updated_at=now()where organization_id=$1 and id=$2",
      [context.organizationId, id, nextAttempt],
    );
    await c.query(
      "update bank_transactions set state='reconciled',version=version+1,updated_at=now()where organization_id=$1 and id=$2",
      [context.organizationId, counter.id],
    );
    const eventId = await this.event(c, context, id, nextAttempt, "match", input.reason.trim(), {
      counterpartTransactionId: counter.id,
      journalId,
    });
    const auditEventId = randomUUID(),
      outboxEventId = randomUUID();
    await this.audit(
      c,
      context,
      auditEventId,
      id,
      "match",
      BigInt(parent.rows[0].version) + 1n,
      { state: "pending_counterpart" },
      { state: "reconciled" },
    );
    await this.outbox(c, context, outboxEventId, id, "internal_transfer.reconciled", {
      transferId: id,
    });
    return {
      transfer: await this.view(c, context.organizationId, id),
      eventId,
      outboxEventId,
      mutation: {
        resourceVersion: (BigInt(parent.rows[0].version) + 1n).toString(),
        auditEventId,
        correlationId: context.correlationId,
        idempotencyReplayed: false,
        nextActions: ["get", "unmatch"],
      },
    };
  });
}

export async function unmatchOperation(
  this: PgInternalTransferStore,
  context: InternalTransferContext,
  id: string,
  input: UnmatchInternalTransferInput,
  key: string,
) {
  return this.mutate(context, key, "internal-transfer:unmatch", { id, input }, async (c) => {
    const p = await c.query<{ version: string; current_attempt_number: number }>(
      "select version::text,current_attempt_number from internal_transfers where organization_id=$1 and id=$2 and state in('pending_counterpart','matched','reconciled')for update",
      [context.organizationId, id],
    );
    if (!p.rows[0]) throw new Error("INTERNAL_TRANSFER_NOT_ACTIVE");
    if (input.expectedResourceVersion !== p.rows[0].version) throw new Error("VERSION_CONFLICT");
    const a = await c.query<{
      outgoing_transaction_id: string | null;
      incoming_transaction_id: string | null;
      outgoing_journal_id: string | null;
      incoming_journal_id: string | null;
      fee: Record<string, unknown> | null;
      fee_transaction_id: string | null;
      posting_mode: string;
    }>(
      "select outgoing_transaction_id,incoming_transaction_id,outgoing_journal_id,incoming_journal_id,fee,fee_transaction_id,posting_mode from internal_transfer_attempts where organization_id=$1 and transfer_id=$2 and attempt_number=$3 for update",
      [context.organizationId, id, p.rows[0].current_attempt_number],
    );
    const transactionIds = [
      a.rows[0]!.outgoing_transaction_id,
      a.rows[0]!.incoming_transaction_id,
      a.rows[0]!.fee_transaction_id,
    ]
      .filter((value): value is string => Boolean(value))
      .sort();
    for (const transactionId of transactionIds)
      await this.lockTx(c, context.organizationId, transactionId);
    const outgoingReversal = a.rows[0]!.outgoing_journal_id
        ? await this.reverse(c, context, a.rows[0]!.outgoing_journal_id, input.reason)
        : null,
      incomingReversal = a.rows[0]!.incoming_journal_id
        ? await this.reverse(c, context, a.rows[0]!.incoming_journal_id, input.reason)
        : null;
    const feeJournal =
        a.rows[0]!.fee?.mode === "separate_transaction"
          ? (a.rows[0]!.fee.journalId as string | undefined)
          : undefined,
      feeReversal = feeJournal ? await this.reverse(c, context, feeJournal, input.reason) : null;
    const nextAttempt = p.rows[0].current_attempt_number + 1;
    await c.query(
      `insert into internal_transfer_attempts(organization_id,id,transfer_id,attempt_number,state,posting_mode,fee,outgoing_transaction_id,incoming_transaction_id,fee_transaction_id,outgoing_journal_id,incoming_journal_id,outgoing_reversal_journal_id,incoming_reversal_journal_id,fee_reversal_journal_id,unmatched_by,unmatched_at,unmatched_reason,correlation_id,created_by)values($1,$2,$3,$4,'unmatched',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now(),$16,$17,$15)`,
      [
        context.organizationId,
        randomUUID(),
        id,
        nextAttempt,
        a.rows[0]!.posting_mode,
        a.rows[0]!.fee,
        a.rows[0]!.outgoing_transaction_id,
        a.rows[0]!.incoming_transaction_id,
        a.rows[0]!.fee_transaction_id,
        a.rows[0]!.outgoing_journal_id,
        a.rows[0]!.incoming_journal_id,
        outgoingReversal,
        incomingReversal,
        feeReversal,
        context.actorId,
        input.reason.trim(),
        context.correlationId,
      ],
    );
    await c.query(
      "update internal_transfers set state='unmatched',current_attempt_number=$3,version=version+1,updated_at=now()where organization_id=$1 and id=$2",
      [context.organizationId, id, nextAttempt],
    );
    await c.query(
      "delete from internal_transfer_claims where organization_id=$1 and transfer_id=$2",
      [context.organizationId, id],
    );
    for (const txId of [
      a.rows[0]!.outgoing_transaction_id,
      a.rows[0]!.incoming_transaction_id,
      a.rows[0]!.fee_transaction_id,
    ].filter(Boolean))
      await c.query(
        "update bank_transactions set state='needs_review',version=version+1,updated_at=now()where organization_id=$1 and id=$2",
        [context.organizationId, txId],
      );
    const eventId = await this.event(c, context, id, nextAttempt, "unmatch", input.reason.trim(), {
      outgoingReversal,
      incomingReversal,
      feeReversal,
    });
    const auditEventId = randomUUID(),
      outboxEventId = randomUUID();
    await this.audit(
      c,
      context,
      auditEventId,
      id,
      "unmatch",
      BigInt(p.rows[0].version) + 1n,
      null,
      { state: "unmatched" },
    );
    await this.outbox(c, context, outboxEventId, id, "internal_transfer.unmatched", {
      transferId: id,
    });
    return {
      transfer: await this.view(c, context.organizationId, id),
      eventId,
      outboxEventId,
      mutation: {
        resourceVersion: (BigInt(p.rows[0].version) + 1n).toString(),
        auditEventId,
        correlationId: context.correlationId,
        idempotencyReplayed: false,
        nextActions: ["get"],
      },
    };
  });
}
