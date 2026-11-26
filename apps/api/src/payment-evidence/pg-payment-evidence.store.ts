import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg, { type PoolClient } from "pg";
import { resolveOrganizationWorkflowPolicy } from "../workflow-policy/organization-workflow-policy.service.js";
import {
  applySolopreneurExpenseDefaults,
  applySolopreneurPurchaseDocumentDefaults,
} from "./payment-evidence-evaluator.js";
import { queryPaymentEvidenceGapsReport } from "./payment-evidence-gaps.query.js";
import { mergePaymentEvidenceFields } from "./payment-input.helper.js";
import type {
  PaymentEvidenceContext,
  PaymentEvidenceGapsReport,
  UpdatePaymentEvidenceInput,
} from "./payment-evidence.types.js";

@Injectable()
export class PgPaymentEvidenceStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  private async lockReplay(client: PoolClient, org: string, key: string, hash: string) {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`${org}:${key}`]);
    const res = await client.query<{
      request_hash: string;
      response_body: Record<string, unknown>;
    }>(
      `select request_hash, response_body
         from api_idempotency_records
        where organization_id = $1 and idempotency_key = $2
        for update`,
      [org, key],
    );
    if (!res.rows[0]) return undefined;
    if (res.rows[0].request_hash !== hash) throw new Error("IDEMPOTENCY_CONFLICT");
    return res.rows[0].response_body;
  }

  private saveReplay(
    client: PoolClient,
    org: string,
    key: string,
    operation: string,
    hash: string,
    response: unknown,
  ) {
    return client.query(
      `insert into api_idempotency_records
       (organization_id, idempotency_key, operation, request_hash, response_body)
       values ($1, $2, $3, $4, $5)`,
      [org, key, operation, hash, response],
    );
  }

  async updateExpensePaymentEvidence(
    context: PaymentEvidenceContext,
    expenseId: string,
    expectedVersion: string,
    input: UpdatePaymentEvidenceInput,
    key: string,
  ) {
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ expenseId, expectedVersion, input }))
      .digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replay = await this.lockReplay(client, context.organizationId, key, requestHash);
      if (replay) {
        await client.query("rollback");
        return { ...replay, idempotencyReplayed: true };
      }

      const found = await client.query<{
        state: string;
        version: string;
        payment_method: string;
        paid_on: string | null;
        payment_evidence_ref: string | null;
        transaction_evidence: string;
        payment_evidence_missing: boolean;
      }>(
        `select state::text, version::text, payment_method, paid_on::text,
                payment_evidence_ref, transaction_evidence, payment_evidence_missing
           from expenses
          where organization_id = $1 and id = $2
          for update`,
        [context.organizationId, expenseId],
      );
      const existing = found.rows[0];
      if (!existing) throw new Error("RESOURCE_NOT_FOUND");
      if (existing.version !== expectedVersion) throw new Error("VERSION_CONFLICT");
      if (["reversed", "rejected"].includes(existing.state)) {
        throw new Error("EXPENSE_FINAL_IMMUTABLE");
      }

      const merged = mergePaymentEvidenceFields(input, existing);
      const nextVersion = (BigInt(existing.version) + 1n).toString();
      await client.query("select set_config('app.payment_evidence_update', 'on', true)");
      await client.query(
        `update expenses set
           payment_method = $3, paid_on = $4::date, payment_evidence_ref = $5,
           transaction_evidence = $6, version = $7::bigint, updated_at = now()
         where organization_id = $1 and id = $2`,
        [
          context.organizationId,
          expenseId,
          merged.paymentMethod,
          merged.paidOn,
          merged.paymentEvidenceRef,
          merged.transactionEvidence,
          nextVersion,
        ],
      );

      const policy = await resolveOrganizationWorkflowPolicy(context.organizationId, client);
      const reason = input.reason?.trim() || "Re-evaluated on payment evidence update";
      if (
        policy.operatingMode === "solopreneur" &&
        ["approved", "posted"].includes(existing.state)
      ) {
        await applySolopreneurExpenseDefaults(client, context, expenseId, reason);
      }

      const refreshed = await client.query<{
        cit_state: string;
        vat_state: string;
        payment_evidence_missing: boolean;
      }>(
        `select cit_state::text, vat_state::text, payment_evidence_missing
           from expenses where organization_id = $1 and id = $2`,
        [context.organizationId, expenseId],
      );
      const current = refreshed.rows[0]!;
      const auditEventId = randomUUID();
      const outboxEventId = randomUUID();
      await client.query(
        `insert into resource_audit_events
         (organization_id, id, resource_type, resource_key, resource_version, action, actor_id, correlation_id, before_state, after_state)
         values ($1, $2, 'expense', $3, $4, 'update_payment_evidence', $5, $6, $7, $8)`,
        [
          context.organizationId,
          auditEventId,
          expenseId,
          nextVersion,
          context.actorId,
          context.correlationId,
          {
            paymentMethod: existing.payment_method,
            paidOn: existing.paid_on,
            paymentEvidenceRef: existing.payment_evidence_ref,
            transactionEvidence: existing.transaction_evidence,
            paymentEvidenceMissing: existing.payment_evidence_missing,
          },
          {
            ...merged,
            paymentEvidenceMissing: current.payment_evidence_missing,
            citState: current.cit_state,
            vatState: current.vat_state,
            reason,
          },
        ],
      );
      await client.query(
        `insert into outbox_events
         (organization_id, id, aggregate_type, aggregate_id, event_type, schema_version, payload, correlation_id)
         values ($1, $2, 'expense', $3, 'expense.payment_evidence_updated', 1, $4, $5)`,
        [
          context.organizationId,
          outboxEventId,
          expenseId,
          { expenseId, resourceVersion: nextVersion, ...merged },
          context.correlationId,
        ],
      );

      const response = {
        expenseId,
        state: existing.state,
        ...merged,
        paymentEvidenceMissing: current.payment_evidence_missing,
        citState: current.cit_state,
        vatState: current.vat_state,
        resourceVersion: nextVersion,
        auditEventId,
        outboxEventId,
      };
      await this.saveReplay(
        client,
        context.organizationId,
        key,
        "expense:update-payment-evidence",
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

  async updateDocumentPaymentEvidence(
    context: PaymentEvidenceContext,
    documentId: string,
    expectedVersion: string,
    input: UpdatePaymentEvidenceInput,
    key: string,
  ) {
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ documentId, expectedVersion, input }))
      .digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replay = await this.lockReplay(client, context.organizationId, key, requestHash);
      if (replay) {
        await client.query("rollback");
        return { ...replay, idempotencyReplayed: true };
      }

      const found = await client.query<{
        type: string;
        state: string;
        version: string;
        payment_method: string;
        paid_on: string | null;
        payment_evidence_ref: string | null;
        transaction_evidence: string;
        payment_evidence_missing: boolean;
      }>(
        `select type::text, state::text, version::text, payment_method, paid_on::text,
                payment_evidence_ref, transaction_evidence, payment_evidence_missing
           from commercial_documents
          where organization_id = $1 and id = $2
          for update`,
        [context.organizationId, documentId],
      );
      const existing = found.rows[0];
      if (!existing) throw new Error("RESOURCE_NOT_FOUND");
      if (existing.type !== "purchase_invoice") throw new Error("VALIDATION_FAILED");
      if (existing.version !== expectedVersion) throw new Error("VERSION_CONFLICT");
      if (existing.state === "cancelled") throw new Error("INVALID_DOCUMENT_TRANSITION");

      const merged = mergePaymentEvidenceFields(input, existing);
      const nextVersion = (BigInt(existing.version) + 1n).toString();
      await client.query("select set_config('app.payment_evidence_update', 'on', true)");
      await client.query(
        `update commercial_documents set
           payment_method = $3, paid_on = $4::date, payment_evidence_ref = $5,
           transaction_evidence = $6, version = $7::bigint, updated_at = now()
         where organization_id = $1 and id = $2`,
        [
          context.organizationId,
          documentId,
          merged.paymentMethod,
          merged.paidOn,
          merged.paymentEvidenceRef,
          merged.transactionEvidence,
          nextVersion,
        ],
      );

      const policy = await resolveOrganizationWorkflowPolicy(context.organizationId, client);
      const reason = input.reason?.trim() || "Re-evaluated on payment evidence update";
      if (
        policy.operatingMode === "solopreneur" &&
        ["approved", "posted", "partially_paid", "paid"].includes(existing.state)
      ) {
        await applySolopreneurPurchaseDocumentDefaults(client, context, documentId, reason);
      }

      const refreshedDoc = await client.query<{ payment_evidence_missing: boolean }>(
        `select payment_evidence_missing from commercial_documents where organization_id = $1 and id = $2`,
        [context.organizationId, documentId],
      );
      const refreshedLines = await client.query<{
        line_number: number;
        cit_state: string;
        cit_eligible_minor: string;
        vat_state: string;
        vat_eligible_minor: string;
        payment_evidence_missing: boolean;
      }>(
        `select line_number, cit_state::text, cit_eligible_minor::text,
                vat_state::text, vat_eligible_minor::text, payment_evidence_missing
           from commercial_document_lines
          where organization_id = $1 and document_id = $2
          order by line_number`,
        [context.organizationId, documentId],
      );
      const paymentEvidenceMissing = refreshedDoc.rows[0]?.payment_evidence_missing ?? false;
      const auditEventId = randomUUID();
      const outboxEventId = randomUUID();
      await client.query(
        `insert into resource_audit_events
         (organization_id, id, resource_type, resource_key, resource_version, action, actor_id, correlation_id, before_state, after_state)
         values ($1, $2, 'commercial_document', $3, $4, 'update_payment_evidence', $5, $6, $7, $8)`,
        [
          context.organizationId,
          auditEventId,
          documentId,
          nextVersion,
          context.actorId,
          context.correlationId,
          {
            paymentMethod: existing.payment_method,
            paidOn: existing.paid_on,
            paymentEvidenceRef: existing.payment_evidence_ref,
            transactionEvidence: existing.transaction_evidence,
            paymentEvidenceMissing: existing.payment_evidence_missing,
          },
          { ...merged, paymentEvidenceMissing, reason },
        ],
      );
      await client.query(
        `insert into outbox_events
         (organization_id, id, aggregate_type, aggregate_id, event_type, schema_version, payload, correlation_id)
         values ($1, $2, 'commercial_document', $3, 'purchase_invoice.payment_evidence_updated', 1, $4, $5)`,
        [
          context.organizationId,
          outboxEventId,
          documentId,
          { documentId, resourceVersion: nextVersion, ...merged },
          context.correlationId,
        ],
      );

      const response = {
        documentId,
        type: "purchase_invoice" as const,
        state: existing.state,
        ...merged,
        paymentEvidenceMissing,
        lines: refreshedLines.rows.map((l) => ({
          lineNumber: l.line_number,
          citState: l.cit_state,
          citEligibleMinor: l.cit_eligible_minor,
          vatState: l.vat_state,
          vatEligibleMinor: l.vat_eligible_minor,
          paymentEvidenceMissing: l.payment_evidence_missing,
        })),
        resourceVersion: nextVersion,
        auditEventId,
        outboxEventId,
      };
      await this.saveReplay(
        client,
        context.organizationId,
        key,
        "commercial-document:update-payment-evidence",
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

  async reportPaymentEvidenceGaps(
    organizationId: string,
    query: { startsOn: string; endsOn: string },
  ): Promise<PaymentEvidenceGapsReport> {
    return queryPaymentEvidenceGapsReport(this.pool, organizationId, query);
  }
}
