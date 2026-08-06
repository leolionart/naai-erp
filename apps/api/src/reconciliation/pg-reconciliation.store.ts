import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg, { type PoolClient } from "pg";
import type {
  MatchInput,
  ReconcileInput,
  ReconciliationContext,
  ReconciliationStore,
  SuggestInput,
  UnreconcileInput,
} from "./reconciliation.types.js";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type BankRow = {
  id: string;
  state: string;
  amount_minor: string;
  currency: string;
  booking_date: string;
  reference: string | null;
  description: string;
  counterparty_name: string | null;
  financial_account_id: string;
  ledger_account_code: string;
  base_currency: string;
  version: string;
};

@Injectable()
export class PgReconciliationStore implements ReconciliationStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  async getCandidates(org: string, transactionId: string) {
    const result = await this.pool.query(
      `select r.id,r.algorithm_version "algorithmVersion",r.threshold_bps "thresholdBps",
              r.ambiguity_margin_bps "ambiguityMarginBps",r.created_at "createdAt",
              coalesce(json_agg(jsonb_build_object('id',c.id,'rank',c.rank,'targetType',c.target_type,
                'targetId',coalesce(c.commercial_document_id,c.expense_id),'confidenceBps',c.confidence_bps,
                'factors',c.factors,'outstandingMinor',c.outstanding_minor::text,'currency',c.currency,
                'status',c.status) order by c.rank) filter(where c.id is not null),'[]') items
       from reconciliation_candidate_runs r left join reconciliation_candidates c
         on c.organization_id=r.organization_id and c.run_id=r.id
       where r.organization_id=$1 and r.bank_transaction_id=$2
       group by r.organization_id,r.id order by r.created_at desc limit 1`,
      [org, transactionId],
    );
    return result.rows[0] ?? { items: [] };
  }

  async suggest(
    context: ReconciliationContext,
    transactionId: string,
    input: Required<SuggestInput>,
    key: string,
  ) {
    return this.mutation(
      context,
      key,
      "reconciliation:suggest",
      { transactionId, input },
      async (c) => {
        const bank = await this.bank(c, context.organizationId, transactionId);
        if (!["imported", "suggested", "needs_review"].includes(bank.state))
          throw new Error("INVALID_BANK_TRANSACTION_TRANSITION");
        const runId = randomUUID();
        const candidates = await this.scoreCandidates(c, context.organizationId, bank);
        await c.query(
          `insert into reconciliation_candidate_runs
         (organization_id,id,bank_transaction_id,algorithm_version,threshold_bps,ambiguity_margin_bps,created_by,correlation_id)
         values($1,$2,$3,1,$4,$5,$6,$7)`,
          [
            context.organizationId,
            runId,
            transactionId,
            input.thresholdBps,
            input.ambiguityMarginBps,
            context.actorId,
            context.correlationId,
          ],
        );
        for (const [index, candidate] of candidates.entries())
          await c.query(
            `insert into reconciliation_candidates
           (organization_id,id,run_id,rank,target_type,commercial_document_id,expense_id,
            confidence_bps,factors,outstanding_minor,currency)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
              context.organizationId,
              randomUUID(),
              runId,
              index + 1,
              candidate.targetType,
              candidate.targetId,
              null,
              candidate.confidenceBps,
              candidate.factors,
              candidate.outstandingMinor,
              candidate.currency,
            ],
          );
        const above = candidates.filter(
          (candidate) => candidate.confidenceBps >= input.thresholdBps,
        );
        const unique =
          above.length === 1 &&
          (candidates[1] === undefined ||
            above[0]!.confidenceBps - candidates[1].confidenceBps >= input.ambiguityMarginBps);
        const nextState = unique ? "suggested" : "needs_review";
        const version = BigInt(bank.version) + 1n;
        await c.query(
          "update bank_transactions set state=$3,version=version+1,updated_at=now() where organization_id=$1 and id=$2",
          [context.organizationId, transactionId, nextState],
        );
        const eventId = await this.event(
          c,
          context,
          null,
          transactionId,
          "suggest",
          bank.state,
          nextState,
          unique ? "Unique candidate" : "Candidate review required",
          { runId, candidateCount: candidates.length },
        );
        const auditEventId = randomUUID(),
          outboxEventId = randomUUID();
        await this.audit(
          c,
          context,
          auditEventId,
          "bank_transaction",
          transactionId,
          "suggest",
          version,
          { state: bank.state },
          { state: nextState, candidateRunId: runId },
        );
        await this.outbox(c, context, outboxEventId, transactionId, "bank_transaction.suggested", {
          transactionId,
          state: nextState,
          candidateRunId: runId,
        });
        return {
          transactionId,
          state: nextState,
          candidateRunId: runId,
          candidateCount: candidates.length,
          ...(unique ? { uniqueCandidateId: candidates[0]!.targetId } : {}),
          eventId,
          outboxEventId,
          mutation: {
            resourceVersion: version.toString(),
            auditEventId,
            correlationId: context.correlationId,
            idempotencyReplayed: false,
            nextActions: unique ? ["get-candidates", "match"] : ["get-candidates", "match-manual"],
          },
        };
      },
    );
  }

  async match(
    context: ReconciliationContext,
    transactionId: string,
    input: MatchInput,
    key: string,
  ) {
    return this.mutation(
      context,
      key,
      "reconciliation:match",
      { transactionId, input },
      async (c) => {
        const bank = await this.bank(c, context.organizationId, transactionId);
        if (!input.manualOverride && bank.state !== "suggested")
          throw new Error("RECONCILIATION_MANUAL_OVERRIDE_REQUIRED");
        if (input.manualOverride && !["suggested", "needs_review", "imported"].includes(bank.state))
          throw new Error("INVALID_BANK_TRANSACTION_TRANSITION");
        if (!["suggested", "needs_review", "imported"].includes(bank.state))
          throw new Error("INVALID_BANK_TRANSACTION_TRANSITION");
        await this.validateBaseAmount(c, context.organizationId, bank, input);
        const latestRun = await c.query<{ id: string; generation: number }>(
          "select id,(select count(*)::int from reconciliation_candidate_runs x where x.organization_id=$1 and x.bank_transaction_id=$2) generation from reconciliation_candidate_runs where organization_id=$1 and bank_transaction_id=$2 order by created_at desc limit 1",
          [context.organizationId, transactionId],
        );
        const sorted = [...input.allocations].sort((a, b) =>
          `${a.targetType}:${a.targetId}`.localeCompare(`${b.targetType}:${b.targetId}`),
        );
        const resolved = [] as Array<
          (typeof sorted)[number] & { controlAccountCode: string; outstandingBeforeMinor: string }
        >;
        for (const allocation of sorted)
          resolved.push({
            ...allocation,
            ...(await this.lockAndValidateTarget(c, context.organizationId, bank, allocation)),
          });
        const parent = await c.query<{ id: string; current_attempt_number: number }>(
          "select id,current_attempt_number from payment_reconciliations where organization_id=$1 and bank_transaction_id=$2 for update",
          [context.organizationId, transactionId],
        );
        const reconciliationId = parent.rows[0]?.id ?? input.id ?? randomUUID();
        const attemptNumber = (parent.rows[0]?.current_attempt_number ?? 0) + 1;
        if (!parent.rows[0])
          await c.query(
            `insert into payment_reconciliations
        (organization_id,id,bank_transaction_id,direction,statement_amount_minor,statement_currency,current_attempt_number,created_by)
        values($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              context.organizationId,
              reconciliationId,
              transactionId,
              BigInt(bank.amount_minor) > 0n ? "receipt" : "payment",
              BigInt(bank.amount_minor) < 0n
                ? (-BigInt(bank.amount_minor)).toString()
                : bank.amount_minor,
              bank.currency,
              attemptNumber,
              context.actorId,
            ],
          );
        else
          await c.query(
            "update payment_reconciliations set current_attempt_number=$3,version=version+1,updated_at=now() where organization_id=$1 and id=$2",
            [context.organizationId, reconciliationId, attemptNumber],
          );
        const attemptId = randomUUID();
        await c.query(
          `insert into reconciliation_attempts
         (organization_id,id,reconciliation_id,attempt_number,bank_transaction_id,state,bank_amount_minor,bank_currency,base_amount_minor,
          exchange_rate_id,candidate_run_id,policy_version,candidate_generation,manual_override,override_reason,override_reference,created_by)
         values($1,$2,$3,$4,$5,'matched',$6,$7,$8,$9,$10,1,$11,$12,$13,$14,$15)`,
          [
            context.organizationId,
            attemptId,
            reconciliationId,
            attemptNumber,
            transactionId,
            BigInt(bank.amount_minor) < 0n
              ? (-BigInt(bank.amount_minor)).toString()
              : bank.amount_minor,
            bank.currency,
            input.baseAmountMinor,
            input.exchangeRateId ?? null,
            latestRun.rows[0]?.id ?? null,
            latestRun.rows[0]?.generation ?? 1,
            input.manualOverride ?? false,
            input.overrideReason?.trim() ?? null,
            input.overrideReference?.trim() ?? null,
            context.actorId,
          ],
        );
        for (const [index, allocation] of resolved.entries())
          await c.query(
            `insert into reconciliation_allocations
           (organization_id,id,line_number,reconciliation_id,target_type,commercial_document_id,expense_id,
            target_amount_minor,target_currency,base_amount_minor,statement_amount_minor,target_outstanding_before_minor,control_account_code)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [
              context.organizationId,
              allocation.id ?? randomUUID(),
              index + 1,
              attemptId,
              allocation.targetType,
              allocation.targetType === "commercial_document" ? allocation.targetId : null,
              allocation.targetType === "expense" ? allocation.targetId : null,
              allocation.targetAmountMinor,
              allocation.targetCurrency,
              allocation.baseAmountMinor,
              allocation.targetAmountMinor,
              allocation.outstandingBeforeMinor,
              allocation.controlAccountCode,
            ],
          );
        for (const [index, adjustment] of (input.adjustments ?? []).entries())
          await c.query(
            `insert into reconciliation_adjustments
           (organization_id,id,line_number,reconciliation_id,kind,base_amount_minor,statement_amount_minor,account_code,side,description)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              context.organizationId,
              adjustment.id ?? randomUUID(),
              index + 1,
              attemptId,
              adjustment.kind,
              adjustment.baseAmountMinor,
              adjustment.baseAmountMinor,
              adjustment.accountCode,
              adjustment.side,
              adjustment.description.trim(),
            ],
          );
        await c.query(
          "update bank_transactions set state='matched',version=version+1,updated_at=now() where organization_id=$1 and id=$2",
          [context.organizationId, transactionId],
        );
        const eventId = await this.event(
          c,
          context,
          attemptId,
          transactionId,
          input.manualOverride ? "manual_override" : "match",
          bank.state,
          "matched",
          input.overrideReason?.trim() ?? "Candidate matched",
          { allocationCount: resolved.length },
        );
        const auditEventId = randomUUID(),
          outboxEventId = randomUUID();
        await this.audit(
          c,
          context,
          auditEventId,
          "reconciliation",
          reconciliationId,
          "match",
          1n,
          null,
          { state: "matched", transactionId, attemptNumber },
        );
        await this.outbox(c, context, outboxEventId, transactionId, "bank_transaction.matched", {
          transactionId,
          reconciliationId,
        });
        return {
          reconciliation: await this.view(c, context.organizationId, reconciliationId),
          eventId,
          outboxEventId,
          mutation: {
            resourceVersion: "1",
            auditEventId,
            correlationId: context.correlationId,
            idempotencyReplayed: false,
            nextActions: ["get", "reconcile"],
          },
        };
      },
    );
  }

  async reconcile(
    context: ReconciliationContext,
    transactionId: string,
    input: ReconcileInput,
    key: string,
  ) {
    const reason = input.reason.trim();
    return this.mutation(
      context,
      key,
      "reconciliation:reconcile",
      { transactionId, input },
      async (c) => {
        const bank = await this.bank(c, context.organizationId, transactionId);
        if (bank.state !== "matched") throw new Error("INVALID_BANK_TRANSACTION_TRANSITION");
        const attempt = await this.activeAttempt(
          c,
          context.organizationId,
          transactionId,
          "matched",
        );
        await this.assertPeriod(c, context, bank.booking_date);
        const allocations = await c.query<{
          id: string;
          target_type: string;
          commercial_document_id: string | null;
          expense_id: string | null;
          base_amount_minor: string;
          control_account_code: string;
        }>(
          "select id,target_type,commercial_document_id,expense_id,base_amount_minor::text,control_account_code from reconciliation_allocations where organization_id=$1 and reconciliation_id=$2 order by id for update",
          [context.organizationId, attempt.id],
        );
        for (const allocation of allocations.rows)
          await this.revalidateTarget(c, context.organizationId, attempt.id, allocation);
        const adjustments = await c.query<{
          kind: string;
          base_amount_minor: string;
          account_code: string;
          side: "debit" | "credit";
          description: string;
        }>(
          "select kind,base_amount_minor::text,account_code,side,description from reconciliation_adjustments where organization_id=$1 and reconciliation_id=$2 order by id for update",
          [context.organizationId, attempt.id],
        );
        const lines: Array<{
          account: string;
          debit?: bigint;
          credit?: bigint;
          description: string;
          dimensions: Record<string, string>;
        }> = [];
        const baseAmount = BigInt(attempt.base_amount_minor);
        lines.push({
          account: bank.ledger_account_code,
          ...(BigInt(bank.amount_minor) > 0n ? { debit: baseAmount } : { credit: baseAmount }),
          description: `Bank ${transactionId}`,
          dimensions: { bankTransactionId: transactionId, reconciliationId: attempt.id },
        });
        for (const allocation of allocations.rows)
          lines.push({
            account: allocation.control_account_code,
            ...(BigInt(bank.amount_minor) > 0n
              ? { credit: BigInt(allocation.base_amount_minor) }
              : { debit: BigInt(allocation.base_amount_minor) }),
            description: `Settlement ${allocation.commercial_document_id ?? allocation.expense_id}`,
            dimensions: {
              bankTransactionId: transactionId,
              reconciliationId: attempt.id,
              targetType: allocation.target_type,
              targetId: allocation.commercial_document_id ?? allocation.expense_id!,
            },
          });
        for (const adjustment of adjustments.rows)
          lines.push({
            account: adjustment.account_code,
            ...(adjustment.side === "debit"
              ? { debit: BigInt(adjustment.base_amount_minor) }
              : { credit: BigInt(adjustment.base_amount_minor) }),
            description: adjustment.description,
            dimensions: {
              bankTransactionId: transactionId,
              reconciliationId: attempt.id,
              adjustmentKind: adjustment.kind,
            },
          });
        const debit = lines.reduce((sum, line) => sum + (line.debit ?? 0n), 0n),
          credit = lines.reduce((sum, line) => sum + (line.credit ?? 0n), 0n);
        if (debit !== credit) throw new Error("RECONCILIATION_JOURNAL_UNBALANCED");
        const journalId = randomUUID();
        await c.query(
          `insert into journal_entries
        (organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by)
        values($1,$2,$3,$4,$5,'posted',2,$6,now(),$6,$7,now(),$6)`,
          [
            context.organizationId,
            journalId,
            bank.booking_date,
            `Bank reconciliation ${attempt.id}`,
            bank.base_currency,
            context.actorId,
            reason,
          ],
        );
        for (const [index, line] of lines.entries())
          await c.query(
            `insert into journal_lines
        (organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)
        values($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              context.organizationId,
              journalId,
              index + 1,
              line.account,
              line.debit?.toString() ?? null,
              line.credit?.toString() ?? null,
              line.description,
              line.dimensions,
            ],
          );
        await c.query(
          "update reconciliation_attempts set state='reconciled',journal_id=$3,version=version+1,reconciled_by=$4,reconciled_at=now(),reconciled_reason=$5,updated_at=now() where organization_id=$1 and id=$2",
          [context.organizationId, attempt.id, journalId, context.actorId, reason],
        );
        await c.query(
          "update bank_transactions set state='reconciled',version=version+1,updated_at=now() where organization_id=$1 and id=$2",
          [context.organizationId, transactionId],
        );
        await this.refreshDocuments(c, context.organizationId, attempt.id);
        const eventId = await this.event(
          c,
          context,
          attempt.id,
          transactionId,
          "reconcile",
          "matched",
          "reconciled",
          reason,
          { journalId },
        );
        const auditEventId = randomUUID(),
          outboxEventId = randomUUID();
        await this.audit(
          c,
          context,
          auditEventId,
          "reconciliation",
          attempt.id,
          "reconcile",
          BigInt(attempt.version) + 1n,
          { state: "matched" },
          { state: "reconciled", journalId },
        );
        await this.outbox(c, context, outboxEventId, transactionId, "bank_transaction.reconciled", {
          transactionId,
          reconciliationId: attempt.id,
          journalId,
        });
        await c.query(
          "update payment_reconciliations set version=version+1,updated_at=now() where organization_id=$1 and id=$2",
          [context.organizationId, attempt.reconciliation_id],
        );
        return {
          reconciliation: await this.view(c, context.organizationId, attempt.reconciliation_id),
          eventId,
          outboxEventId,
          mutation: {
            resourceVersion: (BigInt(attempt.version) + 1n).toString(),
            auditEventId,
            correlationId: context.correlationId,
            idempotencyReplayed: false,
            nextActions: ["get", "unreconcile"],
          },
        };
      },
    );
  }

  async unreconcile(
    context: ReconciliationContext,
    transactionId: string,
    input: UnreconcileInput,
    key: string,
  ) {
    const reason = input.reason.trim();
    return this.mutation(
      context,
      key,
      "reconciliation:unreconcile",
      { transactionId, input },
      async (c) => {
        const bank = await this.bank(c, context.organizationId, transactionId);
        if (bank.state !== "reconciled") throw new Error("RECONCILIATION_NOT_RECONCILED");
        const attempt = await this.activeAttempt(
          c,
          context.organizationId,
          transactionId,
          "reconciled",
        );
        const journal = await c.query<{ journal_date: string; currency: string }>(
          "select journal_date,currency from journal_entries where organization_id=$1 and id=$2 and state='posted' for update",
          [context.organizationId, attempt.journal_id],
        );
        if (!journal.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
        await this.assertPeriod(c, context, journal.rows[0].journal_date);
        const source = await c.query<{
          account_code: string;
          debit_minor: string | null;
          credit_minor: string | null;
          description: string | null;
          dimensions: Record<string, string>;
        }>(
          "select account_code,debit_minor::text,credit_minor::text,description,dimensions from journal_lines where organization_id=$1 and journal_id=$2 order by line_number",
          [context.organizationId, attempt.journal_id],
        );
        const reversalJournalId = randomUUID();
        await c.query(
          `insert into journal_entries
        (organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by,reversal_of_id)
        values($1,$2,$3,$4,$5,'posted',2,$6,now(),$6,$7,now(),$6,$8)`,
          [
            context.organizationId,
            reversalJournalId,
            journal.rows[0].journal_date,
            `Unreconcile ${attempt.id}`,
            journal.rows[0].currency,
            context.actorId,
            reason,
            attempt.journal_id,
          ],
        );
        for (const [index, line] of source.rows.entries())
          await c.query(
            `insert into journal_lines
        (organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)
        values($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              context.organizationId,
              reversalJournalId,
              index + 1,
              line.account_code,
              line.credit_minor,
              line.debit_minor,
              line.description,
              { ...line.dimensions, reversalOfJournalId: attempt.journal_id },
            ],
          );
        await c.query(
          "update journal_entries set state='reversed',version=version+1,updated_at=now() where organization_id=$1 and id=$2",
          [context.organizationId, attempt.journal_id],
        );
        await c.query(
          "update reconciliation_attempts set state='unreconciled',reversal_journal_id=$3,version=version+1,unreconciled_by=$4,unreconciled_at=now(),unreconciled_reason=$5,updated_at=now() where organization_id=$1 and id=$2",
          [context.organizationId, attempt.id, reversalJournalId, context.actorId, reason],
        );
        await c.query(
          "update bank_transactions set state='needs_review',version=version+1,updated_at=now() where organization_id=$1 and id=$2",
          [context.organizationId, transactionId],
        );
        await this.refreshDocuments(c, context.organizationId, attempt.id);
        const eventId = await this.event(
          c,
          context,
          attempt.id,
          transactionId,
          "unreconcile",
          "reconciled",
          "unreconciled",
          reason,
          { reversalJournalId },
        );
        const auditEventId = randomUUID(),
          outboxEventId = randomUUID();
        await this.audit(
          c,
          context,
          auditEventId,
          "reconciliation",
          attempt.id,
          "unreconcile",
          BigInt(attempt.version) + 1n,
          { state: "reconciled" },
          { state: "unreconciled", reversalJournalId },
        );
        await this.outbox(
          c,
          context,
          outboxEventId,
          transactionId,
          "bank_transaction.unreconciled",
          { transactionId, reconciliationId: attempt.id, reversalJournalId },
        );
        await c.query(
          "update payment_reconciliations set version=version+1,updated_at=now() where organization_id=$1 and id=$2",
          [context.organizationId, attempt.reconciliation_id],
        );
        return {
          reconciliation: await this.view(c, context.organizationId, attempt.reconciliation_id),
          eventId,
          outboxEventId,
          mutation: {
            resourceVersion: (BigInt(attempt.version) + 1n).toString(),
            auditEventId,
            correlationId: context.correlationId,
            idempotencyReplayed: false,
            nextActions: ["get", "suggest", "match-manual"],
          },
        };
      },
    );
  }

  async list(org: string, filters: { state?: string; financialAccountId?: string }) {
    const result = await this.pool.query<{ id: string }>(
      `select p.id from payment_reconciliations p join bank_transactions b on b.organization_id=p.organization_id and b.id=p.bank_transaction_id
       join reconciliation_attempts r on r.organization_id=p.organization_id and r.reconciliation_id=p.id and r.attempt_number=p.current_attempt_number
       where p.organization_id=$1 and ($2::text is null or r.state::text=$2) and ($3::text is null or b.financial_account_id=$3)
       order by p.created_at desc,p.id`,
      [org, filters.state ?? null, filters.financialAccountId ?? null],
    );
    return {
      items: await Promise.all(result.rows.map((row) => this.view(this.pool, org, row.id))),
    };
  }
  async get(org: string, id: string) {
    const exists = await this.pool.query(
      "select 1 from payment_reconciliations where organization_id=$1 and id=$2",
      [org, id],
    );
    return exists.rows[0] ? this.view(this.pool, org, id) : undefined;
  }

  private async view(queryable: Pick<PoolClient, "query"> | pg.Pool, org: string, id: string) {
    const parent = await queryable.query<{
      id: string;
      bank_transaction_id: string;
      direction: "receipt" | "payment";
      statement_amount_minor: string;
      statement_currency: string;
      current_attempt_number: number;
      version: string;
    }>(
      "select id,bank_transaction_id,direction,statement_amount_minor::text,statement_currency,current_attempt_number,version::text from payment_reconciliations where organization_id=$1 and id=$2",
      [org, id],
    );
    const p = parent.rows[0];
    if (!p) throw new Error("RESOURCE_NOT_FOUND");
    const attempts = await queryable.query<{
      id: string;
      attempt_number: number;
      state: "matched" | "reconciled" | "unreconciled";
      policy_version: number;
      candidate_generation: number;
      base_amount_minor: string;
      override_reason: string | null;
      journal_id: string | null;
      reversal_journal_id: string | null;
      reconciled_by: string | null;
      reconciled_reason: string | null;
      unreconciled_by: string | null;
      unreconciled_reason: string | null;
    }>(
      "select id,attempt_number,state,policy_version,candidate_generation,base_amount_minor::text,override_reason,journal_id,reversal_journal_id,reconciled_by,reconciled_reason,unreconciled_by,unreconciled_reason from reconciliation_attempts where organization_id=$1 and reconciliation_id=$2 order by attempt_number",
      [org, id],
    );
    const mapped = [] as Record<string, unknown>[];
    const sourceIds = new Set<string>();
    for (const attempt of attempts.rows) {
      const allocations = await queryable.query<{
        id: string;
        target_type: string;
        commercial_document_id: string | null;
        expense_id: string | null;
        target_amount_minor: string;
        target_currency: string;
        base_amount_minor: string;
      }>(
        "select id,target_type,commercial_document_id,expense_id,target_amount_minor::text,target_currency,base_amount_minor::text from reconciliation_allocations where organization_id=$1 and reconciliation_id=$2 order by line_number",
        [org, attempt.id],
      );
      const adjustments = await queryable.query<{
        id: string;
        kind: string;
        account_code: string;
        side: string;
        base_amount_minor: string;
        description: string;
      }>(
        "select id,kind,account_code,side,base_amount_minor::text,description from reconciliation_adjustments where organization_id=$1 and reconciliation_id=$2 order by line_number",
        [org, attempt.id],
      );
      for (const a of allocations.rows) sourceIds.add(a.commercial_document_id ?? a.expense_id!);
      mapped.push({
        attemptNumber: attempt.attempt_number,
        state: attempt.state,
        policyVersion: attempt.policy_version,
        candidateGeneration: attempt.candidate_generation,
        bankBaseAmountMinor: attempt.base_amount_minor,
        allocations: allocations.rows.map((a) => ({
          id: a.id,
          targetType: a.target_type,
          targetId: a.commercial_document_id ?? a.expense_id,
          targetAmountMinor: a.target_amount_minor,
          targetCurrency: a.target_currency,
          baseAmountMinor: a.base_amount_minor,
        })),
        adjustments: adjustments.rows.map((a) => ({
          id: a.id,
          kind: a.kind,
          accountCode: a.account_code,
          side: a.side,
          baseAmountMinor: a.base_amount_minor,
          description: a.description,
        })),
        ...(attempt.override_reason ? { manualOverrideReason: attempt.override_reason } : {}),
        ...(attempt.journal_id ? { journalId: attempt.journal_id } : {}),
        ...(attempt.reversal_journal_id ? { reversalJournalId: attempt.reversal_journal_id } : {}),
        ...(attempt.reconciled_by ? { reconciledBy: attempt.reconciled_by } : {}),
        ...(attempt.reconciled_reason ? { reconciledReason: attempt.reconciled_reason } : {}),
        ...(attempt.unreconciled_by ? { unreconciledBy: attempt.unreconciled_by } : {}),
        ...(attempt.unreconciled_reason ? { unreconciledReason: attempt.unreconciled_reason } : {}),
      });
    }
    const current = attempts.rows.find((a) => a.attempt_number === p.current_attempt_number)!;
    const evidence = sourceIds.size
      ? await queryable.query<{ id: string }>(
          "select id from evidence_records where organization_id=$1 and subject_id=any($2::text[]) order by id",
          [org, [...sourceIds]],
        )
      : { rows: [] as { id: string }[] };
    return {
      id: p.id,
      bankTransactionId: p.bank_transaction_id,
      direction: p.direction,
      statementAmountMinor: p.statement_amount_minor,
      statementCurrency: p.statement_currency,
      state: current.state,
      currentAttemptNumber: p.current_attempt_number,
      attempts: mapped,
      resourceVersion: p.version,
      nextActions:
        current.state === "matched"
          ? ["reconcile"]
          : current.state === "reconciled"
            ? ["unreconcile"]
            : ["suggest", "match"],
      drilldown: {
        bankTransactionId: p.bank_transaction_id,
        ...(current.journal_id ? { journalId: current.journal_id } : {}),
        ...(current.reversal_journal_id ? { reversalJournalId: current.reversal_journal_id } : {}),
        sourceDocumentIds: [...sourceIds],
        evidenceIds: evidence.rows.map((e) => e.id),
      },
    };
  }

  private async scoreCandidates(c: PoolClient, org: string, bank: BankRow) {
    const positive = BigInt(bank.amount_minor) > 0n;
    const docs = await c.query<{
      id: string;
      document_number: string;
      document_date: string;
      currency: string;
      gross_minor: string;
      display_name: string;
      outstanding: string;
    }>(
      `select d.id,d.document_number,d.document_date,d.currency,d.gross_minor::text,p.display_name,
      (d.gross_minor-coalesce((select sum(a.target_amount_minor) from reconciliation_allocations a join reconciliation_attempts r on r.organization_id=a.organization_id and r.id=a.reconciliation_id where a.organization_id=d.organization_id and a.commercial_document_id=d.id and r.state in ('matched','reconciled')),0))::text outstanding
      from commercial_documents d join parties p on p.organization_id=d.organization_id and p.id=d.party_id
      where d.organization_id=$1 and (($2 and d.type='sales_invoice' and d.state in ('issued','posted','partially_paid')) or (not $2 and d.type='purchase_invoice' and d.state in ('posted','partially_paid')))`,
      [org, positive],
    );
    const amount =
      BigInt(bank.amount_minor) < 0n ? -BigInt(bank.amount_minor) : BigInt(bank.amount_minor);
    return docs.rows
      .filter((row) => BigInt(row.outstanding) > 0n)
      .map((row) => {
        const outstanding = BigInt(row.outstanding);
        const amountScore = amount === outstanding ? 4000 : amount < outstanding ? 2500 : 0;
        const currencyScore = row.currency === bank.currency ? 1500 : 0;
        const referenceScore = `${bank.reference ?? ""} ${bank.description}`
          .toUpperCase()
          .includes(row.document_number.toUpperCase())
          ? 2000
          : 0;
        const partyScore =
          bank.counterparty_name &&
          bank.counterparty_name.toUpperCase().includes(row.display_name.toUpperCase())
            ? 1500
            : 0;
        const days = Math.abs(
          (Date.parse(bank.booking_date) - Date.parse(row.document_date)) / 86_400_000,
        );
        const dateScore = days <= 7 ? Math.max(0, 1000 - Math.round(days) * 100) : 0;
        return {
          targetType: "commercial_document" as const,
          targetId: row.id,
          confidenceBps: amountScore + currencyScore + referenceScore + partyScore + dateScore,
          factors: {
            amountBps: amountScore,
            currencyBps: currencyScore,
            referenceBps: referenceScore,
            partyBps: partyScore,
            dateBps: dateScore,
            daysApart: Math.round(days),
          },
          outstandingMinor: row.outstanding,
          currency: row.currency,
        };
      })
      .sort((a, b) => b.confidenceBps - a.confidenceBps || a.targetId.localeCompare(b.targetId));
  }

  private async bank(c: PoolClient, org: string, id: string): Promise<BankRow> {
    await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${org}:reconciliation:${id}`,
    ]);
    const result = await c.query<BankRow>(
      `select b.id,b.state,b.amount_minor::text,b.currency,b.booking_date::text,b.reference,b.description,b.counterparty_name,b.financial_account_id,f.ledger_account_code,o.base_currency,b.version::text
      from bank_transactions b join financial_accounts f on f.organization_id=b.organization_id and f.id=b.financial_account_id join organizations o on o.id=b.organization_id
      where b.organization_id=$1 and b.id=$2 for update of b`,
      [org, id],
    );
    if (!result.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    return result.rows[0];
  }
  private async validateBaseAmount(c: PoolClient, org: string, bank: BankRow, input: MatchInput) {
    const base = BigInt(input.baseAmountMinor),
      amount =
        BigInt(bank.amount_minor) < 0n ? -BigInt(bank.amount_minor) : BigInt(bank.amount_minor);
    if (bank.currency === bank.base_currency) {
      if (input.exchangeRateId || base !== amount)
        throw new Error("RECONCILIATION_BASE_AMOUNT_INVALID");
      return;
    }
    if (!input.exchangeRateId) throw new Error("RECONCILIATION_EXCHANGE_RATE_REQUIRED");
    const rate = await c.query<{ expected: string }>(
      `select round($3::numeric*rate)::text expected from exchange_rates where organization_id=$1 and id=$2 and source_currency=$4 and target_currency=$5`,
      [org, input.exchangeRateId, amount.toString(), bank.currency, bank.base_currency],
    );
    if (!rate.rows[0] || BigInt(rate.rows[0].expected) !== base)
      throw new Error("RECONCILIATION_BASE_AMOUNT_INVALID");
  }
  private async lockAndValidateTarget(
    c: PoolClient,
    org: string,
    bank: BankRow,
    allocation: MatchInput["allocations"][number],
  ) {
    if (allocation.targetType === "commercial_document") {
      const result = await c.query<{
        type: string;
        state: string;
        currency: string;
        gross_minor: string;
        control_account_code: string;
        reserved: string;
      }>(
        `select d.type,d.state,d.currency,d.gross_minor::text,d.control_account_code,
        coalesce((select sum(a.target_amount_minor)::text from reconciliation_allocations a join reconciliation_attempts r on r.organization_id=a.organization_id and r.id=a.reconciliation_id where a.organization_id=d.organization_id and a.commercial_document_id=d.id and r.state in ('matched','reconciled')),'0') reserved
        from commercial_documents d where d.organization_id=$1 and d.id=$2 for update`,
        [org, allocation.targetId],
      );
      const row = result.rows[0],
        positive = BigInt(bank.amount_minor) > 0n;
      if (
        !row ||
        row.currency !== allocation.targetCurrency ||
        (positive
          ? row.type !== "sales_invoice" ||
            !["issued", "posted", "partially_paid"].includes(row.state)
          : row.type !== "purchase_invoice" || !["posted", "partially_paid"].includes(row.state))
      )
        throw new Error("RECONCILIATION_TARGET_INVALID");
      if (BigInt(allocation.targetAmountMinor) > BigInt(row.gross_minor) - BigInt(row.reserved))
        throw new Error("RECONCILIATION_OVERALLOCATION");
      return {
        controlAccountCode: row.control_account_code,
        outstandingBeforeMinor: (BigInt(row.gross_minor) - BigInt(row.reserved)).toString(),
      };
    }
    const result = await c.query<{
      state: string;
      currency: string;
      gross_minor: string;
      counter_account_code: string;
      reserved: string;
    }>(
      `select e.state,e.currency,e.gross_minor::text,e.counter_account_code,
      coalesce((select sum(a.target_amount_minor)::text from reconciliation_allocations a join reconciliation_attempts r on r.organization_id=a.organization_id and r.id=a.reconciliation_id where a.organization_id=e.organization_id and a.expense_id=e.id and r.state in ('matched','reconciled')),'0') reserved
      from expenses e where e.organization_id=$1 and e.id=$2 for update`,
      [org, allocation.targetId],
    );
    const row = result.rows[0];
    if (
      !row ||
      BigInt(bank.amount_minor) > 0n ||
      row.state !== "posted" ||
      row.currency !== allocation.targetCurrency ||
      row.counter_account_code === bank.ledger_account_code
    )
      throw new Error("RECONCILIATION_TARGET_INVALID");
    if (BigInt(allocation.targetAmountMinor) > BigInt(row.gross_minor) - BigInt(row.reserved))
      throw new Error("RECONCILIATION_OVERALLOCATION");
    return {
      controlAccountCode: row.counter_account_code,
      outstandingBeforeMinor: (BigInt(row.gross_minor) - BigInt(row.reserved)).toString(),
    };
  }
  private async revalidateTarget(
    c: PoolClient,
    org: string,
    attemptId: string,
    allocation: {
      target_type: string;
      commercial_document_id: string | null;
      expense_id: string | null;
    },
  ) {
    const table =
        allocation.target_type === "commercial_document" ? "commercial_documents" : "expenses",
      id = allocation.commercial_document_id ?? allocation.expense_id;
    const result = await c.query(
      `select id from ${table} where organization_id=$1 and id=$2 for update`,
      [org, id],
    );
    if (!result.rows[0]) throw new Error("RECONCILIATION_TARGET_INVALID");
    const over = await c.query<{ overallocated: boolean }>(
      `select exists(select 1 from reconciliation_allocations a where a.organization_id=$1 and a.reconciliation_id=$2 and a.id=$3 and a.target_amount_minor > (select ${table === "commercial_documents" ? "gross_minor" : "gross_minor"} from ${table} where organization_id=$1 and id=$4)) as overallocated`,
      [org, attemptId, (allocation as { id?: string }).id ?? "", id],
    );
    if (over.rows[0]?.overallocated) throw new Error("RECONCILIATION_OVERALLOCATION");
  }
  private async activeAttempt(c: PoolClient, org: string, transactionId: string, state: string) {
    const result = await c.query<{
      id: string;
      reconciliation_id: string;
      attempt_number: number;
      state: string;
      base_amount_minor: string;
      journal_id: string | null;
      version: string;
    }>(
      "select id,reconciliation_id,attempt_number,state,base_amount_minor::text,journal_id,version::text from reconciliation_attempts where organization_id=$1 and bank_transaction_id=$2 and state=$3 for update",
      [org, transactionId, state],
    );
    if (!result.rows[0]) throw new Error("RECONCILIATION_ACTIVE_ATTEMPT_NOT_FOUND");
    return result.rows[0];
  }
  private async refreshDocuments(c: PoolClient, org: string, attemptId: string) {
    const documents = await c.query<{ commercial_document_id: string }>(
      "select distinct commercial_document_id from reconciliation_allocations where organization_id=$1 and reconciliation_id=$2 and commercial_document_id is not null",
      [org, attemptId],
    );
    for (const { commercial_document_id: id } of documents.rows) {
      const result = await c.query<{ gross_minor: string; type: string; paid: string }>(
        `select d.gross_minor::text,d.type,
        coalesce((select sum(a.target_amount_minor)::text from reconciliation_allocations a join reconciliation_attempts r on r.organization_id=a.organization_id and r.id=a.reconciliation_id where a.organization_id=d.organization_id and a.commercial_document_id=d.id and r.state='reconciled'),'0') paid
        from commercial_documents d where d.organization_id=$1 and d.id=$2 for update`,
        [org, id],
      );
      const row = result.rows[0];
      if (!row) continue;
      const paid = BigInt(row.paid),
        gross = BigInt(row.gross_minor);
      const state =
        paid === 0n
          ? row.type === "sales_invoice"
            ? "issued"
            : "posted"
          : paid >= gross
            ? "paid"
            : "partially_paid";
      await c.query(
        "update commercial_documents set state=$3,version=version+1,updated_at=now() where organization_id=$1 and id=$2",
        [org, id, state],
      );
    }
  }
  private async assertPeriod(c: PoolClient, context: ReconciliationContext, date: string) {
    const result = await c.query<{ state: string }>(
      "select state from fiscal_periods where organization_id=$1 and $2::date between starts_on and ends_on",
      [context.organizationId, date],
    );
    if (result.rows.length !== 1)
      throw new Error(result.rows.length ? "FISCAL_PERIOD_AMBIGUOUS" : "FISCAL_PERIOD_NOT_FOUND");
    if (result.rows[0]!.state === "hard_locked") throw new Error("PERIOD_HARD_LOCKED");
    if (
      result.rows[0]!.state === "soft_locked" &&
      !context.roles.some((role) => ["owner", "finance_admin"].includes(role))
    )
      throw new Error("PERIOD_SOFT_LOCKED");
  }
  private async mutation(
    context: ReconciliationContext,
    key: string,
    operation: string,
    request: unknown,
    action: (c: PoolClient) => Promise<Record<string, unknown>>,
  ) {
    const requestHash = hash(request),
      c = await this.pool.connect();
    try {
      await c.query("begin");
      await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${context.organizationId}:${key}`,
      ]);
      const prior = await c.query<{ request_hash: string; response_body: Record<string, unknown> }>(
        "select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2 for update",
        [context.organizationId, key],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
        await c.query("rollback");
        const body = prior.rows[0].response_body;
        return body.mutation && typeof body.mutation === "object"
          ? {
              ...body,
              mutation: {
                ...(body.mutation as Record<string, unknown>),
                idempotencyReplayed: true,
              },
            }
          : { ...body, idempotencyReplayed: true };
      }
      const response = await action(c);
      await c.query(
        "insert into api_idempotency_records(organization_id,idempotency_key,operation,request_hash,response_body) values($1,$2,$3,$4,$5)",
        [context.organizationId, key, operation, requestHash, response],
      );
      await c.query("commit");
      return response;
    } catch (error) {
      await c.query("rollback");
      throw error;
    } finally {
      c.release();
    }
  }
  private async event(
    c: PoolClient,
    context: ReconciliationContext,
    reconciliationId: string | null,
    transactionId: string,
    action: string,
    from: string,
    to: string,
    reason: string,
    details: unknown,
  ) {
    const id = randomUUID();
    await c.query(
      "insert into reconciliation_events(organization_id,id,reconciliation_id,bank_transaction_id,action,from_state,to_state,actor_id,reason,correlation_id,details) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [
        context.organizationId,
        id,
        reconciliationId,
        transactionId,
        action,
        from,
        to,
        context.actorId,
        reason,
        context.correlationId,
        details,
      ],
    );
    return id;
  }
  private audit(
    c: PoolClient,
    context: ReconciliationContext,
    id: string,
    type: string,
    key: string,
    action: string,
    version: bigint,
    before: unknown,
    after: unknown,
  ) {
    return c.query(
      "insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        context.organizationId,
        id,
        type,
        key,
        version.toString(),
        action,
        context.actorId,
        context.correlationId,
        before,
        after,
      ],
    );
  }
  private outbox(
    c: PoolClient,
    context: ReconciliationContext,
    id: string,
    transactionId: string,
    eventType: string,
    payload: unknown,
  ) {
    return c.query(
      "insert into outbox_events(organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id) values($1,$2,'bank_transaction',$3,$4,1,$5,$6)",
      [context.organizationId, id, transactionId, eventType, payload, context.correlationId],
    );
  }
}
