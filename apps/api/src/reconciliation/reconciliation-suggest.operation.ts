import { randomUUID } from "node:crypto";
import type { MatchInput, ReconciliationContext, SuggestInput } from "./reconciliation.types.js";
import type { PgReconciliationStore } from "./pg-reconciliation.store.js";

export async function suggestOperation(
  this: PgReconciliationStore,
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
      const above = candidates.filter((candidate) => candidate.confidenceBps >= input.thresholdBps);
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

export async function matchOperation(
  this: PgReconciliationStore,
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
