import { createHash, randomUUID } from "node:crypto";
import { type PoolClient } from "pg";
import { mergePaymentEvidenceFields } from "../payment-evidence/payment-input.helper.js";
import type {
  CommercialDocumentContext,
  CreateCommercialDocumentInput,
} from "./commercial-document.types.js";
import { type StoredDocument } from "./pg-commercial-document.store.shared.js";
import type { PgCommercialDocumentStore } from "./pg-commercial-document.store.js";

export async function reverseReplaceOperation(
  this: PgCommercialDocumentStore,
  context: CommercialDocumentContext,
  id: string,
  expectedVersion: string,
  input: CreateCommercialDocumentInput,
  reason: string,
  idempotencyKey: string,
  allowReconciliation = false,
) {
  const requestHash = createHash("sha256")
    .update(JSON.stringify({ id, expectedVersion, input, reason }))
    .digest("hex");
  const client = await this.pool.connect();
  try {
    await client.query("begin");
    const replay = await this.lockReplay(
      client,
      context.organizationId,
      idempotencyKey,
      requestHash,
    );
    if (replay) {
      await client.query("rollback");
      return { ...replay, idempotencyReplayed: true };
    }
    const found = await client.query<StoredDocument & { journal_id: string | null }>(
      `select id,type,state,document_date::text,currency,party_id,document_number,net_minor::text,tax_minor::text,
        gross_minor::text,control_account_code,original_document_id,created_by,version::text,journal_id
       from commercial_documents where organization_id=$1 and id=$2 for update`,
      [context.organizationId, id],
    );
    const original = found.rows[0];
    if (!original) throw new Error("RESOURCE_NOT_FOUND");
    if (original.version !== expectedVersion) throw new Error("VERSION_CONFLICT");
    const allowedStates = allowReconciliation
      ? ["issued", "posted", "partially_paid", "paid"]
      : ["issued", "posted"];
    if (!original.journal_id || !allowedStates.includes(original.state))
      throw new Error("INVALID_DOCUMENT_TRANSITION");
    const reconciliation = await client.query(
      `select 1 from reconciliation_allocations
        where organization_id=$1 and commercial_document_id=$2 limit 1`,
      [context.organizationId, id],
    );
    if (reconciliation.rows[0] && !allowReconciliation)
      throw new Error("INVALID_DOCUMENT_TRANSITION");
    if ((input.id ?? "") === id) throw new Error("VALIDATION_FAILED");
    await this.assertPostingPeriod(client, context, input.documentDate);
    const reversalJournalId = await this.ensureJournalReversed(
      client,
      context,
      original.journal_id,
      input.documentDate,
      reason,
    );
    await client.query(
      `update commercial_documents set state='cancelled',version=version+1,updated_at=now()
        where organization_id=$1 and id=$2`,
      [context.organizationId, id],
    );
    const replacementId = input.id ?? randomUUID();
    const paymentEvidence = mergePaymentEvidenceFields(input);
    await client.query(
      `insert into commercial_documents
       (organization_id,id,type,state,document_number,series,fiscal_year,party_id,document_date,due_date,currency,net_minor,tax_minor,gross_minor,control_account_code,funding_financial_account_id,payment_method,paid_on,payment_evidence_ref,transaction_evidence,original_document_id,reason,created_by)
       values($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::date,$18,$19,$20,$21,$22)`,
      [
        context.organizationId,
        replacementId,
        input.type,
        input.documentNumber,
        input.series ?? null,
        input.fiscalYear,
        input.partyId,
        input.documentDate,
        input.dueDate,
        input.currency,
        input.netMinor,
        input.taxMinor,
        input.grossMinor,
        input.controlAccountCode,
        input.fundingSource?.financialAccountId ?? null,
        paymentEvidence.paymentMethod,
        paymentEvidence.paidOn,
        paymentEvidence.paymentEvidenceRef,
        paymentEvidence.transactionEvidence,
        input.type === "credit_note" ? (input.originalDocumentId ?? id) : null,
        input.type === "credit_note" ? (input.reason ?? reason) : null,
        context.actorId,
      ],
    );
    const operatingMode = await this.operatingMode(client, context.organizationId);
    for (const [lineIndex, line] of input.lines.entries()) {
      await this.insertDocumentLine(
        client,
        context,
        replacementId,
        lineIndex + 1,
        input,
        line,
        operatingMode,
      );
      for (const [allocationIndex, allocation] of line.allocations.entries())
        await client.query(
          `insert into commercial_document_allocations(organization_id,document_id,line_number,allocation_number,amount_minor,dimensions) values($1,$2,$3,$4,$5,$6)`,
          [
            context.organizationId,
            replacementId,
            lineIndex + 1,
            allocationIndex + 1,
            allocation.amountMinor,
            { ...allocation.dimensions, allocationId: allocation.id },
          ],
        );
    }
    if (allowReconciliation && reconciliation.rows[0]) {
      await client.query(
        `update reconciliation_allocations set commercial_document_id=$3
           where organization_id=$1 and commercial_document_id=$2`,
        [context.organizationId, id, replacementId],
      );
    }
    await client.query(
      `update external_references set document_id=$3,synced_at=now()
        where organization_id=$1 and document_id=$2`,
      [context.organizationId, id, replacementId],
    );
    const auditEventId = randomUUID();
    await client.query(
      `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
       values($1,$2,'commercial_document',$3,$4,'reverse_replace',$5,$6,$7,$8)`,
      [
        context.organizationId,
        auditEventId,
        id,
        (BigInt(original.version) + 1n).toString(),
        context.actorId,
        context.correlationId,
        { state: original.state, journalId: original.journal_id },
        {
          state: "cancelled",
          reversalJournalId,
          replacementId,
          externalReferenceTransferred: true,
          reason,
        },
      ],
    );
    const response = {
      documentId: id,
      state: "cancelled",
      resourceVersion: (BigInt(original.version) + 1n).toString(),
      reversalJournalId,
      replacementDocumentId: replacementId,
      auditEventId,
      nextActions: [],
    };
    await this.saveReplay(
      client,
      context.organizationId,
      idempotencyKey,
      "commercial-document:reverse-replace",
      requestHash,
      response,
    );
    await client.query("commit");
    return { ...response, idempotencyReplayed: false };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Voids a posted/issued document without a replacement: the original journal is reversed (history
 * preserved, net effect zero) and the document becomes `cancelled`. Documents that already have
 * receipts or bank reconciliation are rejected so cash applications are never orphaned.
 */
export async function reverseOperation(
  this: PgCommercialDocumentStore,
  context: CommercialDocumentContext,
  id: string,
  expectedVersion: string,
  reason: string,
  idempotencyKey: string,
) {
  const requestHash = createHash("sha256")
    .update(JSON.stringify({ id, expectedVersion, reason, op: "reverse" }))
    .digest("hex");
  const client = await this.pool.connect();
  try {
    await client.query("begin");
    const replay = await this.lockReplay(
      client,
      context.organizationId,
      idempotencyKey,
      requestHash,
    );
    if (replay) {
      await client.query("rollback");
      return { ...replay, idempotencyReplayed: true };
    }
    const found = await client.query<{
      type: string;
      state: string;
      version: string;
      journal_id: string | null;
      document_date: string;
    }>(
      `select type::text,state::text,version::text,journal_id,document_date::text
         from commercial_documents where organization_id=$1 and id=$2 for update`,
      [context.organizationId, id],
    );
    const original = found.rows[0];
    if (!original) throw new Error("RESOURCE_NOT_FOUND");
    if (original.version !== expectedVersion) throw new Error("VERSION_CONFLICT");
    if (!original.journal_id || !["issued", "posted"].includes(original.state))
      throw new Error("INVALID_DOCUMENT_TRANSITION");
    const applied = await client.query(
      `select 1 from reconciliation_allocations where organization_id=$1 and commercial_document_id=$2
       union all
       select 1 from customer_receipt_allocations where organization_id=$1 and sales_invoice_id=$2
       union all
       select 1 from commercial_documents where organization_id=$1 and original_document_id=$2
       limit 1`,
      [context.organizationId, id],
    );
    if (applied.rows[0]) throw new Error("INVALID_DOCUMENT_TRANSITION");
    await this.assertPostingPeriod(client, context, original.document_date);
    const reversalJournalId = await this.ensureJournalReversed(
      client,
      context,
      original.journal_id,
      original.document_date,
      reason,
    );
    await client.query(
      `update commercial_documents set state='cancelled',version=version+1,updated_at=now()
        where organization_id=$1 and id=$2`,
      [context.organizationId, id],
    );
    const version = (BigInt(original.version) + 1n).toString();
    const auditEventId = randomUUID();
    await client.query(
      `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
       values($1,$2,'commercial_document',$3,$4,'reverse',$5,$6,$7,$8)`,
      [
        context.organizationId,
        auditEventId,
        id,
        version,
        context.actorId,
        context.correlationId,
        { state: original.state, journalId: original.journal_id },
        { state: "cancelled", reversalJournalId, reason },
      ],
    );
    const outboxEventId = randomUUID();
    await client.query(
      `insert into outbox_events(organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)
       values($1,$2,'commercial_document',$3,$4,1,$5,$6)`,
      [
        context.organizationId,
        outboxEventId,
        id,
        `${original.type}.cancelled`,
        { documentId: id, type: original.type, state: "cancelled", reversalJournalId },
        context.correlationId,
      ],
    );
    const response = {
      documentId: id,
      state: "cancelled",
      resourceVersion: version,
      reversalJournalId,
      auditEventId,
      outboxEventId,
      nextActions: [],
    };
    await this.saveReplay(
      client,
      context.organizationId,
      idempotencyKey,
      "commercial-document:reverse",
      requestHash,
      response,
    );
    await client.query("commit");
    return { ...response, idempotencyReplayed: false };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Ensures the linked journal is reversed once: posts a balancing reversal when `posted`, or
 * returns the existing reversal journal ID when the journal was already `reversed` directly.
 */
export async function ensureJournalReversedOperation(
  this: PgCommercialDocumentStore,
  client: PoolClient,
  context: CommercialDocumentContext,
  journalId: string,
  reversalDate: string,
  reason: string,
): Promise<string> {
  const journal = await client.query<{ state: string; currency: string }>(
    `select state,currency from journal_entries where organization_id=$1 and id=$2 for update`,
    [context.organizationId, journalId],
  );
  const row = journal.rows[0];
  if (!row) throw new Error("INVALID_JOURNAL_STATE");
  if (row.state === "reversed") {
    const existing = await client.query<{ id: string }>(
      `select id from journal_entries
        where organization_id=$1 and reversal_of_id=$2
        order by created_at desc limit 1`,
      [context.organizationId, journalId],
    );
    if (!existing.rows[0]) throw new Error("INVALID_JOURNAL_STATE");
    return existing.rows[0].id;
  }
  if (row.state !== "posted") throw new Error("INVALID_JOURNAL_STATE");
  const reversalJournalId = randomUUID();
  await client.query(
    `insert into journal_entries(organization_id,id,journal_date,description,currency,state,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by,reversal_of_id,version)
     values($1,$2,$3,$4,$5,'posted',$6,now(),$6,$7,now(),$6,$8,3)`,
    [
      context.organizationId,
      reversalJournalId,
      reversalDate,
      `Reversal of ${journalId}: ${reason}`,
      row.currency,
      context.actorId,
      reason,
      journalId,
    ],
  );
  await client.query(
    `insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)
     select organization_id,$3,line_number,account_code,credit_minor,debit_minor,description,dimensions
     from journal_lines where organization_id=$1 and journal_id=$2`,
    [context.organizationId, journalId, reversalJournalId],
  );
  await client.query(
    `update journal_entries set state='reversed',version=version+1,updated_at=now() where organization_id=$1 and id=$2`,
    [context.organizationId, journalId],
  );
  return reversalJournalId;
}
