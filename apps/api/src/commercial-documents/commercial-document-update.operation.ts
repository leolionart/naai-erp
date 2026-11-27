import { createHash, randomUUID } from "node:crypto";
import { mergePaymentEvidenceFields } from "../payment-evidence/payment-input.helper.js";
import type {
  CommercialDocumentContext,
  CreateCommercialDocumentInput,
} from "./commercial-document.types.js";
import type { PgCommercialDocumentStore } from "./pg-commercial-document.store.js";

export async function updateOperation(
  this: PgCommercialDocumentStore,
  context: CommercialDocumentContext,
  id: string,
  expectedVersion: string,
  merged: CreateCommercialDocumentInput,
  idempotencyKey: string,
) {
  const requestHash = createHash("sha256")
    .update(JSON.stringify({ expectedVersion, input: merged }))
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

    const existingResult = await client.query<{ state: string; version: string }>(
      `select state, version from commercial_documents
       where organization_id=$1 and id=$2 for update`,
      [context.organizationId, id],
    );
    const existing = existingResult.rows[0];
    if (!existing) throw new Error("RESOURCE_NOT_FOUND");
    if (existing.state !== "draft") throw new Error("INVALID_STATE_TRANSITION");
    if (existing.version.toString() !== expectedVersion) throw new Error("VERSION_CONFLICT");

    const extRefRows = await client.query<{
      system: string;
      external_id: string;
    }>(
      "select system, external_id from external_references where organization_id=$1 and document_id=$2 for update",
      [context.organizationId, id],
    );
    const existingExtRef = extRefRows.rows[0];

    if (merged.externalReference) {
      const extRefResult = await client.query<{
        document_id: string | null;
        expense_id: string | null;
      }>(
        "select document_id, expense_id from external_references where organization_id=$1 and system=$2 and external_id=$3 for update",
        [
          context.organizationId,
          merged.externalReference.system,
          merged.externalReference.externalId,
        ],
      );
      const extRef = extRefResult.rows[0];
      if (extRef) {
        if (extRef.expense_id || (extRef.document_id && extRef.document_id !== id)) {
          throw new Error("DUPLICATE_DOCUMENT");
        }
      }
    }

    if (merged.type === "purchase_invoice")
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `purchase-expense:${context.organizationId}:${merged.partyId ?? ""}:${merged.documentDate}:${merged.grossMinor}:${merged.currency}`,
      ]);
    const duplicateResult = await client.query<{ id: string }>(
      merged.type === "purchase_invoice"
        ? `select id from commercial_documents
           where organization_id=$1 and type='purchase_invoice' and party_id=$2 and document_date=$3 and gross_minor=$4 and currency=$5 and id<>$6 and state<>'cancelled'`
        : `select id from commercial_documents
           where organization_id=$1 and type=$2 and party_id=$3 and document_number=$4 and document_date=$5 and gross_minor=$6 and currency=$7 and id<>$8 and state<>'cancelled'`,
      merged.type === "purchase_invoice"
        ? [
            context.organizationId,
            merged.partyId,
            merged.documentDate,
            merged.grossMinor,
            merged.currency,
            id,
          ]
        : [
            context.organizationId,
            merged.type,
            merged.partyId,
            merged.documentNumber,
            merged.documentDate,
            merged.grossMinor,
            merged.currency,
            id,
          ],
    );
    if (duplicateResult.rows.length > 0) {
      throw new Error("DUPLICATE_DOCUMENT");
    }

    if (merged.type === "purchase_invoice") {
      const duplicateExpense = await client.query<{ id: string }>(
        `select id from expenses
         where organization_id=$1 and payee_party_id is not distinct from $2 and expense_date=$3 and gross_minor=$4 and currency=$5 and state<>'reversed'`,
        [
          context.organizationId,
          merged.partyId,
          merged.documentDate,
          merged.grossMinor,
          merged.currency,
        ],
      );
      if (duplicateExpense.rows.length > 0) {
        throw new Error("DUPLICATE_DOCUMENT");
      }
    }

    if (merged.type === "credit_note") {
      await this.assertCreditAllowed(client, context.organizationId, merged, id);
    }

    await client.query(
      "delete from commercial_document_allocations where organization_id=$1 and document_id=$2",
      [context.organizationId, id],
    );
    await client.query(
      "delete from commercial_document_lines where organization_id=$1 and document_id=$2",
      [context.organizationId, id],
    );

    if (merged.externalReference) {
      if (
        existingExtRef &&
        (existingExtRef.system !== merged.externalReference.system ||
          existingExtRef.external_id !== merged.externalReference.externalId)
      ) {
        await client.query(
          "delete from external_references where organization_id=$1 and system=$2 and external_id=$3",
          [context.organizationId, existingExtRef.system, existingExtRef.external_id],
        );
      }
      await client.query(
        `insert into external_references
         (organization_id, system, external_id, document_id, canonical_url, checksum, version, metadata)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (organization_id, system, external_id) do update set
           document_id=excluded.document_id,
           canonical_url=excluded.canonical_url,
           checksum=excluded.checksum,
           version=excluded.version,
           metadata=excluded.metadata,
           synced_at=now(),
           updated_at=now()`,
        [
          context.organizationId,
          merged.externalReference.system,
          merged.externalReference.externalId,
          id,
          merged.externalReference.canonicalUrl ?? null,
          merged.externalReference.checksum ?? null,
          merged.externalReference.version ?? null,
          merged.externalReference.metadata ?? {},
        ],
      );
    }

    const newVersion = BigInt(existing.version) + 1n;
    const paymentEvidence = mergePaymentEvidenceFields(merged);
    await client.query(
      `update commercial_documents set
        document_number=$3, series=$4, fiscal_year=$5, party_id=$6, document_date=$7, due_date=$8,
        currency=$9, net_minor=$10, tax_minor=$11, gross_minor=$12, control_account_code=$13,
        funding_financial_account_id=$14, original_document_id=$15, reason=$16, version=$17,
        payment_method=$18, paid_on=$19::date, payment_evidence_ref=$20, transaction_evidence=$21, draft_reasons='[]'::jsonb, updated_at=now()
       where organization_id=$1 and id=$2`,
      [
        context.organizationId,
        id,
        merged.documentNumber,
        merged.series ?? null,
        merged.fiscalYear,
        merged.partyId,
        merged.documentDate,
        merged.dueDate,
        merged.currency,
        merged.netMinor,
        merged.taxMinor,
        merged.grossMinor,
        merged.controlAccountCode,
        merged.fundingSource?.financialAccountId ?? null,
        merged.originalDocumentId ?? null,
        merged.reason ?? null,
        newVersion,
        paymentEvidence.paymentMethod,
        paymentEvidence.paidOn,
        paymentEvidence.paymentEvidenceRef,
        paymentEvidence.transactionEvidence,
      ],
    );

    const operatingMode = await this.operatingMode(client, context.organizationId);
    for (const [lineIndex, line] of merged.lines.entries()) {
      await this.insertDocumentLine(
        client,
        context,
        id,
        lineIndex + 1,
        merged,
        line,
        operatingMode,
      );
      for (const [allocationIndex, allocation] of line.allocations.entries()) {
        await client.query(
          `insert into commercial_document_allocations
           (organization_id,document_id,line_number,allocation_number,amount_minor,dimensions)
           values ($1,$2,$3,$4,$5,$6)`,
          [
            context.organizationId,
            id,
            lineIndex + 1,
            allocationIndex + 1,
            allocation.amountMinor,
            { ...allocation.dimensions, allocationId: allocation.id },
          ],
        );
      }
    }

    const auditEventId = randomUUID();
    const outboxEventId = randomUUID();
    await client.query(
      `insert into resource_audit_events
       (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state)
       values ($1,$2,'commercial_document',$3,$4,'update',$5,$6,$7)`,
      [
        context.organizationId,
        auditEventId,
        id,
        newVersion,
        context.actorId,
        context.correlationId,
        { type: merged.type, state: "draft" },
      ],
    );
    await client.query(
      `insert into outbox_events
       (organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)
       values ($1,$2,'commercial_document',$3,$4,1,$5,$6)`,
      [
        context.organizationId,
        outboxEventId,
        id,
        `${merged.type}.updated`,
        { documentId: id, type: merged.type, state: "draft" },
        context.correlationId,
      ],
    );

    const response = {
      documentId: id,
      type: merged.type,
      state: "draft",
      resourceVersion: newVersion.toString(),
      auditEventId,
      outboxEventId,
      nextActions: this.nextActions(merged.type, "draft"),
    };
    await this.saveReplay(
      client,
      context.organizationId,
      idempotencyKey,
      "commercial-document:update",
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

export async function deleteDraftOperation(
  this: PgCommercialDocumentStore,
  context: CommercialDocumentContext,
  id: string,
  expectedVersion: string,
  reason: string,
  idempotencyKey: string,
) {
  const requestHash = createHash("sha256")
    .update(JSON.stringify({ id, expectedVersion, reason }))
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
      id: string;
      type: string;
      state: string;
      version: string;
      journal_id: string | null;
      document_number: string;
      document_date: string;
      currency: string;
      gross_minor: string;
      party_id: string;
    }>(
      `select id,type::text,state::text,version::text,journal_id,document_number,document_date::text,currency,gross_minor::text,party_id
         from commercial_documents
        where organization_id=$1 and id=$2 for update`,
      [context.organizationId, id],
    );
    const document = found.rows[0];
    if (!document) throw new Error("RESOURCE_NOT_FOUND");
    if (document.version !== expectedVersion) throw new Error("VERSION_CONFLICT");
    if (document.state !== "draft" || document.journal_id)
      throw new Error("DOCUMENT_DELETE_NOT_ALLOWED");
    const references = await client.query<{ referenced: boolean }>(
      `select exists(
         select 1 from customer_receipt_allocations where organization_id=$1 and sales_invoice_id=$2
         union all
         select 1 from reconciliation_candidates where organization_id=$1 and commercial_document_id=$2
         union all
         select 1 from reconciliation_allocations where organization_id=$1 and commercial_document_id=$2
         union all
         select 1 from commercial_document_events where organization_id=$1 and document_id=$2
         union all
         select 1 from commercial_documents where organization_id=$1 and original_document_id=$2
       ) referenced`,
      [context.organizationId, id],
    );
    if (references.rows[0]?.referenced) throw new Error("DOCUMENT_DELETE_REFERENCED");
    await client.query(
      "delete from commercial_document_allocations where organization_id=$1 and document_id=$2",
      [context.organizationId, id],
    );
    await client.query(
      "delete from commercial_document_lines where organization_id=$1 and document_id=$2",
      [context.organizationId, id],
    );
    await client.query(
      "delete from external_references where organization_id=$1 and document_id=$2",
      [context.organizationId, id],
    );
    await client.query("delete from commercial_documents where organization_id=$1 and id=$2", [
      context.organizationId,
      id,
    ]);
    const auditEventId = randomUUID();
    await client.query(
      `insert into resource_audit_events
       (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
       values($1,$2,'commercial_document',$3,$4,'delete_draft',$5,$6,$7,null)`,
      [
        context.organizationId,
        auditEventId,
        id,
        document.version,
        context.actorId,
        context.correlationId,
        { ...document, deletionReason: reason },
      ],
    );
    await client.query(
      `insert into outbox_events
       (organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)
       values($1,$2,$3,$4,$5,1,$6,$7)`,
      [
        context.organizationId,
        randomUUID(),
        document.type,
        id,
        `${document.type}.deleted`,
        {
          documentId: id,
          type: document.type,
          documentNumber: document.document_number,
          documentDate: document.document_date,
          currency: document.currency,
          grossMinor: document.gross_minor,
          partyId: document.party_id,
          reason,
        },
        context.correlationId,
      ],
    );
    const response = {
      documentId: id,
      deleted: true,
      deletedState: "draft",
      auditEventId,
      nextActions: [],
    };
    await this.saveReplay(
      client,
      context.organizationId,
      idempotencyKey,
      "commercial-document:delete-draft",
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
