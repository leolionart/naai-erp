import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg, { type PoolClient } from "pg";
import type {
  CreateInternalTransferInput,
  InternalTransferContext,
  InternalTransferStore,
  MatchInternalTransferInput,
  UnmatchInternalTransferInput,
} from "./internal-transfer.types.js";
const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
type Tx = {
  id: string;
  state: string;
  amount_minor: string;
  currency: string;
  booking_date: string;
  reference: string | null;
  description: string;
  financial_account_id: string;
  ledger_account_code: string;
};
@Injectable()
export class PgInternalTransferStore implements InternalTransferStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  async list(org: string, f: { state?: string; financialAccountId?: string }) {
    const r = await this.pool.query<{ id: string }>(
      `select distinct t.id from internal_transfers t join internal_transfer_attempts a on a.organization_id=t.organization_id and a.transfer_id=t.id and a.attempt_number=t.current_attempt_number left join bank_transactions b on b.organization_id=t.organization_id and b.id in(a.outgoing_transaction_id,a.incoming_transaction_id) where t.organization_id=$1 and($2::text is null or t.state::text=$2)and($3::text is null or b.financial_account_id=$3)order by t.id`,
      [org, f.state ?? null, f.financialAccountId ?? null],
    );
    return { items: await Promise.all(r.rows.map((x) => this.view(this.pool, org, x.id))) };
  }
  async get(org: string, id: string) {
    const r = await this.pool.query(
      "select 1 from internal_transfers where organization_id=$1 and id=$2",
      [org, id],
    );
    return r.rows[0] ? this.view(this.pool, org, id) : undefined;
  }
  async transactionCandidates(org: string, transactionId: string) {
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
  async create(context: InternalTransferContext, input: CreateInternalTransferInput, key: string) {
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
      if (ids.length !== providedIds.length)
        throw new Error("INTERNAL_TRANSFER_TRANSACTION_REUSED");
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
  async match(
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
      const ordered = [
        existingId,
        input.counterpartTransactionId,
        attempt.rows[0].fee_transaction_id,
      ]
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
  async unmatch(
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
      const eventId = await this.event(
        c,
        context,
        id,
        nextAttempt,
        "unmatch",
        input.reason.trim(),
        { outgoingReversal, incomingReversal, feeReversal },
      );
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
  private async lockTx(c: PoolClient, org: string, id: string) {
    await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`${org}:bank:${id}`]);
    const r = await c.query<Tx>(
      `select b.id,b.state,b.amount_minor::text,b.currency,b.booking_date::text,b.reference,b.description,b.financial_account_id,f.ledger_account_code from bank_transactions b join financial_accounts f on f.organization_id=b.organization_id and f.id=b.financial_account_id where b.organization_id=$1 and b.id=$2 for update of b`,
      [org, id],
    );
    if (!r.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    return r.rows[0];
  }
  private available(tx: Tx) {
    if (!["imported", "suggested", "needs_review"].includes(tx.state))
      throw new Error("INTERNAL_TRANSFER_TRANSACTION_UNAVAILABLE");
  }
  private async validateTransit(c: PoolClient, org: string, code: string, bankCode: string) {
    const r = await c.query<{ root_type: string }>(
      "select root_type from accounts where organization_id=$1 and code=$2",
      [org, code],
    );
    if (r.rows[0]?.root_type !== "asset" || code === bankCode)
      throw new Error("INTERNAL_TRANSFER_TRANSIT_ACCOUNT_INVALID");
  }
  private async postLeg(
    c: PoolClient,
    context: InternalTransferContext,
    tx: Tx,
    transit: string,
    transferId: string,
    fee?: NonNullable<CreateInternalTransferInput["fee"]>,
  ) {
    await this.period(c, context, tx.booking_date);
    const id = randomUUID(),
      out = BigInt(tx.amount_minor) < 0n,
      amount = out ? -BigInt(tx.amount_minor) : BigInt(tx.amount_minor);
    if (fee) {
      const account = await c.query<{ root_type: string }>(
        "select root_type from accounts where organization_id=$1 and code=$2",
        [context.organizationId, fee.expenseAccountId],
      );
      if (account.rows[0]?.root_type !== "expense")
        throw new Error("INTERNAL_TRANSFER_FEE_ACCOUNT_INVALID");
    }
    await c.query(
      `insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by)values($1,$2,$3,$4,$5,'posted',2,$6,now(),$6,'Internal transfer',now(),$6)`,
      [
        context.organizationId,
        id,
        tx.booking_date,
        `Internal transfer ${transferId}`,
        tx.currency,
        context.actorId,
      ],
    );
    const feeAmount = fee ? BigInt(fee.baseAmountMinor) : 0n,
      principal = out ? amount - feeAmount : amount;
    const lines = out
      ? [
          { a: transit, d: principal },
          ...(feeAmount > 0n ? [{ a: fee!.expenseAccountId, d: feeAmount }] : []),
          { a: tx.ledger_account_code, c: amount },
        ]
      : [
          { a: tx.ledger_account_code, d: amount },
          { a: transit, c: amount },
        ];
    for (const [x, l] of lines.entries())
      await c.query(
        "insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)values($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          context.organizationId,
          id,
          x + 1,
          l.a,
          l.d?.toString() ?? null,
          l.c?.toString() ?? null,
          `Transfer leg ${tx.id}`,
          {
            internalTransferId: transferId,
            bankTransactionId: tx.id,
            sourceKind: "internal_transfer",
          },
        ],
      );
    return id;
  }
  private async postFee(
    c: PoolClient,
    context: InternalTransferContext,
    tx: Tx,
    expenseAccount: string,
    reason: string,
    transferId: string,
  ) {
    await this.period(c, context, tx.booking_date);
    const amount =
      BigInt(tx.amount_minor) < 0n ? -BigInt(tx.amount_minor) : BigInt(tx.amount_minor);
    if (BigInt(tx.amount_minor) >= 0n) throw new Error("INTERNAL_TRANSFER_FEE_MISMATCH");
    const account = await c.query<{ root_type: string }>(
      "select root_type from accounts where organization_id=$1 and code=$2",
      [context.organizationId, expenseAccount],
    );
    if (account.rows[0]?.root_type !== "expense")
      throw new Error("INTERNAL_TRANSFER_FEE_ACCOUNT_INVALID");
    const id = randomUUID();
    await c.query(
      `insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by)values($1,$2,$3,$4,$5,'posted',2,$6,now(),$6,$7,now(),$6)`,
      [
        context.organizationId,
        id,
        tx.booking_date,
        `Transfer fee ${transferId}`,
        tx.currency,
        context.actorId,
        reason,
      ],
    );
    for (const [x, l] of [
      { a: expenseAccount, d: amount },
      { a: tx.ledger_account_code, c: amount },
    ].entries())
      await c.query(
        "insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)values($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          context.organizationId,
          id,
          x + 1,
          l.a,
          l.d?.toString() ?? null,
          l.c?.toString() ?? null,
          reason,
          { internalTransferId: transferId, bankTransactionId: tx.id, sourceKind: "transfer_fee" },
        ],
      );
    return id;
  }
  private async postDirect(
    c: PoolClient,
    context: InternalTransferContext,
    source: Tx,
    destination: Tx,
    principalInput: string,
    transferId: string,
    fee?: NonNullable<CreateInternalTransferInput["fee"]>,
  ) {
    await this.period(c, context, source.booking_date);
    if (destination.booking_date !== source.booking_date)
      throw new Error("INTERNAL_TRANSFER_DIRECT_DATE_MISMATCH");
    const principal = BigInt(principalInput),
      feeAmount = fee ? BigInt(fee.baseAmountMinor) : 0n;
    if (fee) {
      const account = await c.query<{ root_type: string }>(
        "select root_type from accounts where organization_id=$1 and code=$2",
        [context.organizationId, fee.expenseAccountId],
      );
      if (account.rows[0]?.root_type !== "expense")
        throw new Error("INTERNAL_TRANSFER_FEE_ACCOUNT_INVALID");
    }
    const id = randomUUID();
    await c.query(
      `insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by)values($1,$2,$3,$4,$5,'posted',2,$6,now(),$6,'Internal transfer direct',now(),$6)`,
      [
        context.organizationId,
        id,
        source.booking_date,
        `Internal transfer ${transferId}`,
        source.currency,
        context.actorId,
      ],
    );
    const lines = [
      { a: destination.ledger_account_code, d: principal },
      ...(feeAmount > 0n ? [{ a: fee!.expenseAccountId, d: feeAmount }] : []),
      { a: source.ledger_account_code, c: principal + feeAmount },
    ];
    for (const [x, l] of lines.entries())
      await c.query(
        "insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)values($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          context.organizationId,
          id,
          x + 1,
          l.a,
          l.d?.toString() ?? null,
          l.c?.toString() ?? null,
          `Direct transfer ${transferId}`,
          { internalTransferId: transferId, sourceKind: "internal_transfer_direct" },
        ],
      );
    return id;
  }
  private async reverse(
    c: PoolClient,
    context: InternalTransferContext,
    journalId: string,
    reason: string,
  ) {
    const j = await c.query<{ journal_date: string; currency: string }>(
      "select journal_date::text,currency from journal_entries where organization_id=$1 and id=$2 and state='posted'for update",
      [context.organizationId, journalId],
    );
    if (!j.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    await this.period(c, context, j.rows[0].journal_date);
    const lines = await c.query<{
      account_code: string;
      debit_minor: string | null;
      credit_minor: string | null;
      description: string | null;
      dimensions: Record<string, string>;
    }>(
      "select account_code,debit_minor::text,credit_minor::text,description,dimensions from journal_lines where organization_id=$1 and journal_id=$2 order by line_number",
      [context.organizationId, journalId],
    );
    const id = randomUUID();
    await c.query(
      `insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by,reversal_of_id)values($1,$2,$3,$4,$5,'posted',2,$6,now(),$6,$7,now(),$6,$8)`,
      [
        context.organizationId,
        id,
        j.rows[0].journal_date,
        `Reverse ${journalId}`,
        j.rows[0].currency,
        context.actorId,
        reason,
        journalId,
      ],
    );
    for (const [x, l] of lines.rows.entries())
      await c.query(
        "insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)values($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          context.organizationId,
          id,
          x + 1,
          l.account_code,
          l.credit_minor,
          l.debit_minor,
          l.description,
          { ...l.dimensions, reversalOfJournalId: journalId },
        ],
      );
    await c.query(
      "update journal_entries set state='reversed',version=version+1,updated_at=now()where organization_id=$1 and id=$2",
      [context.organizationId, journalId],
    );
    return id;
  }
  private async period(c: PoolClient, context: InternalTransferContext, date: string) {
    const r = await c.query<{ state: string }>(
      "select state from fiscal_periods where organization_id=$1 and $2::date between starts_on and ends_on",
      [context.organizationId, date],
    );
    if (r.rows.length !== 1)
      throw new Error(r.rows.length ? "FISCAL_PERIOD_AMBIGUOUS" : "FISCAL_PERIOD_NOT_FOUND");
    if (r.rows[0]!.state === "hard_locked") throw new Error("PERIOD_HARD_LOCKED");
    if (
      r.rows[0]!.state === "soft_locked" &&
      !context.roles.some((x) => ["owner", "finance_admin"].includes(x))
    )
      throw new Error("PERIOD_SOFT_LOCKED");
  }
  private amountScore(a: Tx, b: Tx) {
    const aa = BigInt(a.amount_minor) < 0n ? -BigInt(a.amount_minor) : BigInt(a.amount_minor),
      bb = BigInt(b.amount_minor) < 0n ? -BigInt(b.amount_minor) : BigInt(b.amount_minor);
    return Number((6000n * (aa < bb ? aa : bb)) / (aa > bb ? aa : bb));
  }
  private score(a: Tx, b: Tx) {
    const days = Math.abs((Date.parse(a.booking_date) - Date.parse(b.booking_date)) / 86400000);
    const ref =
      a.reference &&
      b.reference &&
      a.reference.trim().toUpperCase() === b.reference.trim().toUpperCase()
        ? 1000
        : 0;
    return this.amountScore(a, b) + 1000 + 1000 + Math.max(0, 1000 - Math.round(days) * 100) + ref;
  }
  private async view(q: Pick<PoolClient, "query"> | pg.Pool, org: string, id: string) {
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
  private async mutate(
    context: InternalTransferContext,
    key: string,
    op: string,
    req: unknown,
    fn: (c: PoolClient) => Promise<Record<string, unknown>>,
  ) {
    const h = digest(req),
      c = await this.pool.connect();
    try {
      await c.query("begin");
      await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${context.organizationId}:${key}`,
      ]);
      const old = await c.query<{ request_hash: string; response_body: Record<string, unknown> }>(
        "select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2 for update",
        [context.organizationId, key],
      );
      if (old.rows[0]) {
        if (old.rows[0].request_hash !== h) throw new Error("IDEMPOTENCY_CONFLICT");
        await c.query("rollback");
        const b = old.rows[0].response_body;
        return b.mutation && typeof b.mutation === "object"
          ? {
              ...b,
              mutation: { ...(b.mutation as Record<string, unknown>), idempotencyReplayed: true },
            }
          : { ...b, idempotencyReplayed: true };
      }
      const response = await fn(c);
      await c.query(
        "insert into api_idempotency_records(organization_id,idempotency_key,operation,request_hash,response_body)values($1,$2,$3,$4,$5)",
        [context.organizationId, key, op, h, response],
      );
      await c.query("commit");
      return response;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  }
  private async event(
    c: PoolClient,
    x: InternalTransferContext,
    t: string,
    n: number,
    a: string,
    r: string,
    d: unknown,
  ) {
    const id = randomUUID();
    await c.query(
      "insert into internal_transfer_events(organization_id,id,transfer_id,attempt_number,action,actor_id,reason,correlation_id,details)values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [x.organizationId, id, t, n, a, x.actorId, r, x.correlationId, d],
    );
    return id;
  }
  private audit(
    c: PoolClient,
    x: InternalTransferContext,
    id: string,
    key: string,
    a: string,
    v: bigint,
    b: unknown,
    z: unknown,
  ) {
    return c.query(
      "insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)values($1,$2,'internal_transfer',$3,$4,$5,$6,$7,$8,$9)",
      [x.organizationId, id, key, v.toString(), a, x.actorId, x.correlationId, b, z],
    );
  }
  private outbox(
    c: PoolClient,
    x: InternalTransferContext,
    id: string,
    key: string,
    e: string,
    p: unknown,
  ) {
    return c.query(
      "insert into outbox_events(organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)values($1,$2,'internal_transfer',$3,$4,1,$5,$6)",
      [x.organizationId, id, key, e, p, x.correlationId],
    );
  }
}
