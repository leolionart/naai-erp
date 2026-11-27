import { randomUUID } from "node:crypto";
import type {
  CreateInternalTransferInput,
  InternalTransferContext,
} from "./internal-transfer.types.js";
import { type Tx } from "./pg-internal-transfer.store.shared.js";
import type { PgInternalTransferStore } from "./pg-internal-transfer.store.js";

export async function transactionCandidatesOperation(
  this: PgInternalTransferStore,
  org: string,
  transactionId: string,
) {
  const tx = await this.pool.query<Tx>(
    `select b.id,b.state,b.amount_minor::text,b.currency,b.booking_date::text,b.reference,b.description,b.financial_account_id,f.ledger_account_code from bank_transactions b join financial_accounts f on f.organization_id=b.organization_id and f.id=b.financial_account_id where b.organization_id=$1 and b.id=$2`,
    [org, transactionId],
  );
  const source = tx.rows[0];
  if (!source) throw new Error("RESOURCE_NOT_FOUND");
  this.available(source);
  const sourceClaim = await this.pool.query(
    `select 1 from internal_transfer_claims where organization_id=$1 and bank_transaction_id=$2
     union all
     select 1 from reconciliation_attempts where organization_id=$1 and bank_transaction_id=$2 and state in('matched','reconciled')
     limit 1`,
    [org, source.id],
  );
  if (sourceClaim.rows[0]) throw new Error("INTERNAL_TRANSFER_TRANSACTION_UNAVAILABLE");
  const result = await this.pool.query<Tx>(
    `select b.id,b.state,b.amount_minor::text,b.currency,b.booking_date::text,b.reference,b.description,b.financial_account_id,f.ledger_account_code from bank_transactions b join financial_accounts f on f.organization_id=b.organization_id and f.id=b.financial_account_id where b.organization_id=$1 and b.id<>$2 and b.financial_account_id<>$3 and sign(b.amount_minor)=-sign($4::bigint) and b.currency=$5 and b.state in('imported','suggested','needs_review') and not exists(select 1 from reconciliation_attempts r where r.organization_id=b.organization_id and r.bank_transaction_id=b.id and r.state in('matched','reconciled')) and not exists(select 1 from internal_transfer_claims c where c.organization_id=b.organization_id and c.bank_transaction_id=b.id) order by abs(abs(b.amount_minor)-abs($4::bigint)),abs(b.booking_date-$6::date),b.id`,
    [
      org,
      source.id,
      source.financial_account_id,
      source.amount_minor,
      source.currency,
      source.booking_date,
    ],
  );
  const candidates = result.rows.map((candidate) => ({
    candidate,
    score: this.score(source, candidate),
  }));
  const eligible = candidates.filter(({ score }) => score >= 8000);
  return {
    transactionId: source.id,
    policyVersion: 1,
    thresholdBps: 8000,
    outcome: eligible.length === 0 ? "none" : eligible.length === 1 ? "unique" : "ambiguous",
    ...(eligible.length === 1 ? { selectedTransactionId: eligible[0]!.candidate.id } : {}),
    items: candidates.map(({ candidate: x, score }) => ({
      transactionId: x.id,
      financialAccountId: x.financial_account_id,
      bookingDate: x.booking_date,
      currency: x.currency,
      amountMinor: x.amount_minor,
      eligible: score >= 8000,
      confidenceBps: score,
      factors: {
        amountBps: this.amountScore(source, x),
        dateBps: Math.max(
          0,
          1000 -
            Math.round(
              Math.abs((Date.parse(source.booking_date) - Date.parse(x.booking_date)) / 86400000),
            ) *
              100,
        ),
        referenceBps:
          source.reference &&
          x.reference &&
          source.reference.trim().toUpperCase() === x.reference.trim().toUpperCase()
            ? 1000
            : 0,
        currencyBps: 1000,
        ownAccountBps: 1000,
      },
      reasons: score >= 8000 ? [] : ["below_threshold"],
    })),
  };
}

export async function createOperation(
  this: PgInternalTransferStore,
  context: InternalTransferContext,
  input: CreateInternalTransferInput,
  key: string,
) {
  return this.mutate(context, key, "internal-transfer:create", input, async (c) => {
    if (input.basePrincipalAmountMinor !== input.principalAmountMinor)
      throw new Error("INTERNAL_TRANSFER_CROSS_CURRENCY_NOT_SUPPORTED");
    if (input.fee?.mode === "embedded" && !input.sourceTransactionId)
      throw new Error("INTERNAL_TRANSFER_FEE_MISMATCH");
    if (
      input.postingMode === "direct" &&
      (!input.sourceTransactionId || !input.destinationTransactionId)
    )
      throw new Error("INTERNAL_TRANSFER_DIRECT_REQUIRES_BOTH_LEGS");
    const providedIds = [
      input.sourceTransactionId,
      input.destinationTransactionId,
      input.fee?.mode === "separate_transaction" ? input.fee.transactionId : undefined,
    ]
      .filter((x): x is string => Boolean(x))
      .sort();
    const ids = [...new Set(providedIds)];
    if (ids.length !== providedIds.length) throw new Error("INTERNAL_TRANSFER_TRANSACTION_REUSED");
    const locked = new Map<string, Tx>();
    for (const txId of ids) locked.set(txId, await this.lockTx(c, context.organizationId, txId));
    const source = input.sourceTransactionId ? locked.get(input.sourceTransactionId) : undefined,
      destination = input.destinationTransactionId
        ? locked.get(input.destinationTransactionId)
        : undefined;
    for (const tx of locked.values()) this.available(tx);
    const principal = BigInt(input.principalAmountMinor),
      feeAmount = input.fee ? BigInt(input.fee.amountMinor) : 0n;
    if (
      source &&
      BigInt(source.amount_minor) !==
        -(principal + (input.fee?.mode === "embedded" ? feeAmount : 0n))
    )
      throw new Error("INTERNAL_TRANSFER_AMOUNT_MISMATCH");
    if (destination && BigInt(destination.amount_minor) !== principal)
      throw new Error("INTERNAL_TRANSFER_AMOUNT_MISMATCH");
    if (
      source &&
      destination &&
      (source.currency !== destination.currency ||
        source.financial_account_id === destination.financial_account_id)
    )
      throw new Error(
        source.currency !== destination.currency
          ? "INTERNAL_TRANSFER_CURRENCY_MISMATCH"
          : "INTERNAL_TRANSFER_SAME_ACCOUNT",
      );
    const first = source ?? destination!;
    if (first.currency !== input.currency) throw new Error("INTERNAL_TRANSFER_CURRENCY_MISMATCH");
    await this.validateTransit(
      c,
      context.organizationId,
      input.transitAccountId,
      first.ledger_account_code,
    );
    const id = input.id ?? randomUUID(),
      attemptId = randomUUID();
    let feeJournalId: string | undefined;
    let outgoingJournal: string | undefined, incomingJournal: string | undefined;
    if (input.postingMode === "direct" && source && destination) {
      outgoingJournal = await this.postDirect(
        c,
        context,
        source,
        destination,
        input.principalAmountMinor,
        id,
        input.fee?.mode === "embedded" ? input.fee : undefined,
      );
    } else {
      outgoingJournal = source
        ? await this.postLeg(
            c,
            context,
            source,
            input.transitAccountId,
            id,
            input.fee?.mode === "embedded" ? input.fee : undefined,
          )
        : undefined;
      incomingJournal = destination
        ? await this.postLeg(c, context, destination, input.transitAccountId, id)
        : undefined;
    }
    if (input.fee?.mode === "separate_transaction") {
      const feeTx = locked.get(input.fee.transactionId!)!;
      this.available(feeTx);
      if (
        BigInt(feeTx.amount_minor) !== -feeAmount ||
        feeTx.currency !== input.currency ||
        !source ||
        feeTx.financial_account_id !== source.financial_account_id
      )
        throw new Error("INTERNAL_TRANSFER_FEE_MISMATCH");
      feeJournalId = await this.postFee(
        c,
        context,
        feeTx,
        input.fee.expenseAccountId,
        input.fee.reason,
        id,
      );
      await c.query(
        "update bank_transactions set state='reconciled',version=version+1,updated_at=now()where organization_id=$1 and id=$2",
        [context.organizationId, feeTx.id],
      );
    }
    const matched = Boolean(source && destination),
      state = matched ? "reconciled" : "pending_counterpart";
    await c.query(
      `insert into internal_transfers(organization_id,id,state,currency,transfer_amount_minor,base_principal_amount_minor,transit_account_code,current_attempt_number,created_by)values($1,$2,$3,$4,$5,$6,$7,1,$8)`,
      [
        context.organizationId,
        id,
        state,
        input.currency,
        input.principalAmountMinor,
        input.basePrincipalAmountMinor,
        input.transitAccountId,
        context.actorId,
      ],
    );
    await c.query(
      `insert into internal_transfer_attempts(organization_id,id,transfer_id,attempt_number,state,posting_mode,fee,outgoing_transaction_id,incoming_transaction_id,fee_transaction_id,outgoing_journal_id,incoming_journal_id,manual_override_reason,matched_by,matched_at,correlation_id,created_by)values($1,$2,$3,1,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        context.organizationId,
        attemptId,
        id,
        state,
        input.postingMode ?? "transit",
        input.fee
          ? {
              ...input.fee,
              journalId:
                feeJournalId ?? (input.fee.mode === "embedded" ? outgoingJournal : undefined),
            }
          : null,
        source?.id ?? null,
        destination?.id ?? null,
        input.fee?.mode === "separate_transaction" ? input.fee.transactionId : null,
        outgoingJournal ?? null,
        incomingJournal ?? null,
        input.reason.trim(),
        matched ? context.actorId : null,
        matched ? new Date() : null,
        context.correlationId,
        context.actorId,
      ],
    );
    for (const [txId, role] of [
      [source?.id, "source"],
      [destination?.id, "destination"],
      [input.fee?.mode === "separate_transaction" ? input.fee.transactionId : undefined, "fee"],
    ] as const)
      if (txId)
        await c.query(
          "insert into internal_transfer_claims(organization_id,bank_transaction_id,transfer_id,attempt_number,role)values($1,$2,$3,1,$4)",
          [context.organizationId, txId, id, role],
        );
    for (const tx of locked.values())
      await c.query(
        "update bank_transactions set state='reconciled',version=version+1,updated_at=now()where organization_id=$1 and id=$2",
        [context.organizationId, tx.id],
      );
    const eventId = await this.event(c, context, id, 1, "create", input.reason.trim(), {
      sourceTransactionId: source?.id,
      destinationTransactionId: destination?.id,
      outgoingJournal,
      incomingJournal,
      feeJournalId,
    });
    const auditEventId = randomUUID(),
      outboxEventId = randomUUID();
    await this.audit(c, context, auditEventId, id, "create", 1n, null, { state });
    await this.outbox(
      c,
      context,
      outboxEventId,
      id,
      matched ? "internal_transfer.reconciled" : "internal_transfer.pending_counterpart",
      { transferId: id },
    );
    return {
      transfer: await this.view(c, context.organizationId, id),
      eventId,
      outboxEventId,
      mutation: {
        resourceVersion: "1",
        auditEventId,
        correlationId: context.correlationId,
        idempotencyReplayed: false,
        nextActions: matched ? ["get", "unmatch"] : ["get", "match", "unmatch"],
      },
    };
  });
}
