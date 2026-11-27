import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { mergePaymentEvidenceFields } from "../payment-evidence/payment-input.helper.js";
import type {
  CommercialDocumentContext,
  CommercialDocumentType,
  CreateCommercialDocumentInput,
} from "./commercial-document.types.js";
import type { PgCommercialDocumentStore } from "./pg-commercial-document.store.js";

/** Re-syncs a draft document that already exists for the same external reference (idempotent ingestion). */
export async function resolveExternalReferenceOperation(
  this: PgCommercialDocumentStore,
  client: PoolClient,
  context: CommercialDocumentContext,
  input: CreateCommercialDocumentInput,
  effectiveControlAccountCode: string,
) {
  const externalReference = input.externalReference;
  if (!externalReference) return undefined;
  const extRefResult = await client.query<{
    document_id: string | null;
    expense_id: string | null;
    canonical_url: string | null;
    checksum: string | null;
    version: string | null;
    metadata: Record<string, unknown>;
  }>(
    "select document_id, expense_id, canonical_url, checksum, version, metadata from external_references where organization_id=$1 and system=$2 and external_id=$3 for update",
    [context.organizationId, externalReference.system, externalReference.externalId],
  );
  const extRef = extRefResult.rows[0];
  if (extRef) {
    if (extRef.expense_id) {
      throw new Error("DUPLICATE_DOCUMENT");
    }
    if (extRef.document_id) {
      const docId = extRef.document_id;
      const docResult = await client.query<{ state: string; version: string; type: string }>(
        "select state, version, type from commercial_documents where organization_id=$1 and id=$2 for update",
        [context.organizationId, docId],
      );
      const doc = docResult.rows[0];
      if (!doc) {
        throw new Error("RESOURCE_NOT_FOUND");
      }
      if (doc.state === "draft") {
        if (input.type === "credit_note") {
          await this.assertCreditAllowed(client, context.organizationId, input, docId);
        }
        await client.query(
          "delete from commercial_document_allocations where organization_id=$1 and document_id=$2",
          [context.organizationId, docId],
        );
        await client.query(
          "delete from commercial_document_lines where organization_id=$1 and document_id=$2",
          [context.organizationId, docId],
        );
        const newVersion = BigInt(doc.version) + 1n;
        const paymentEvidence = mergePaymentEvidenceFields(input);
        await client.query(
          `update commercial_documents set
                type=$3, document_number=$4, series=$5, fiscal_year=$6, party_id=$7, document_date=$8, due_date=$9,
                currency=$10, net_minor=$11, tax_minor=$12, gross_minor=$13, control_account_code=$14,
                funding_financial_account_id=$15, original_document_id=$16, reason=$17, version=$18,
                payment_method=$19, paid_on=$20::date, payment_evidence_ref=$21, transaction_evidence=$22, updated_at=now()
               where organization_id=$1 and id=$2`,
          [
            context.organizationId,
            docId,
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
            effectiveControlAccountCode,
            input.fundingSource?.financialAccountId ?? null,
            input.originalDocumentId ?? null,
            input.reason ?? null,
            newVersion,
            paymentEvidence.paymentMethod,
            paymentEvidence.paidOn,
            paymentEvidence.paymentEvidenceRef,
            paymentEvidence.transactionEvidence,
          ],
        );
        const operatingMode = await this.operatingMode(client, context.organizationId);
        for (const [lineIndex, line] of input.lines.entries()) {
          await this.insertDocumentLine(
            client,
            context,
            docId,
            lineIndex + 1,
            input,
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
                docId,
                lineIndex + 1,
                allocationIndex + 1,
                allocation.amountMinor,
                { ...allocation.dimensions, allocationId: allocation.id },
              ],
            );
          }
        }
        await client.query(
          `update external_references set
                canonical_url=$4, checksum=$5, version=$6, synced_at=now(), metadata=$7, updated_at=now()
               where organization_id=$1 and system=$2 and external_id=$3`,
          [
            context.organizationId,
            externalReference.system,
            externalReference.externalId,
            externalReference.canonicalUrl ?? extRef.canonical_url,
            externalReference.checksum ?? extRef.checksum,
            externalReference.version ?? extRef.version,
            externalReference.metadata ?? extRef.metadata,
          ],
        );
        const auditEventId = randomUUID();
        const outboxEventId = randomUUID();
        await client.query(
          `insert into resource_audit_events
               (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state)
               values ($1,$2,'commercial_document',$3,$4,'update',$5,$6,$7)`,
          [
            context.organizationId,
            auditEventId,
            docId,
            newVersion,
            context.actorId,
            context.correlationId,
            { type: input.type, state: "draft" },
          ],
        );
        await client.query(
          `insert into outbox_events
               (organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)
               values ($1,$2,'commercial_document',$3,$4,1,$5,$6)`,
          [
            context.organizationId,
            outboxEventId,
            docId,
            `${input.type}.updated`,
            { documentId: docId, type: input.type, state: "draft" },
            context.correlationId,
          ],
        );
        const response = {
          documentId: docId,
          type: input.type,
          state: "draft",
          resourceVersion: newVersion.toString(),
          auditEventId,
          outboxEventId,
          nextActions: this.nextActions(input.type, "draft"),
        };
        await client.query("commit");
        return { ...response, idempotencyReplayed: true };
      } else {
        const response = {
          documentId: docId,
          type: doc.type as CommercialDocumentType,
          state: doc.state,
          resourceVersion: doc.version.toString(),
          auditEventId: null,
          outboxEventId: null,
          nextActions: this.nextActions(doc.type as CommercialDocumentType, doc.state),
        };
        await client.query("commit");
        return { ...response, idempotencyReplayed: true };
      }
    }
  }
  return undefined;
}
