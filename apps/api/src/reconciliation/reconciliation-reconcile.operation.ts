import { randomUUID } from "node:crypto";
import { refreshReconciledDocumentsAndPaymentEvidence } from "./reconciliation-document-sync.js";
import type {
  ReconcileInput,
  ReconciliationContext,
  UnreconcileInput,
} from "./reconciliation.types.js";
import type { PgReconciliationStore } from "./pg-reconciliation.store.js";

export async function reconcileOperation(
  this: PgReconciliationStore,
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
      const attempt = await this.activeAttempt(c, context.organizationId, transactionId, "matched");
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
      await refreshReconciledDocumentsAndPaymentEvidence(c, context, attempt.id);
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

export async function unreconcileOperation(
  this: PgReconciliationStore,
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
      await refreshReconciledDocumentsAndPaymentEvidence(c, context, attempt.id);
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
      await this.outbox(c, context, outboxEventId, transactionId, "bank_transaction.unreconciled", {
        transactionId,
        reconciliationId: attempt.id,
        reversalJournalId,
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
          nextActions: ["get", "suggest", "match-manual"],
        },
      };
    },
  );
}
