import type { PoolClient } from "pg";
import { resolveOrganizationWorkflowPolicy } from "../workflow-policy/organization-workflow-policy.service.js";
import {
  applySolopreneurExpenseDefaults,
  applySolopreneurPurchaseDocumentDefaults,
} from "./payment-evidence-evaluator.js";
import { lookupReconciledBankPayment } from "./payment-evidence-queries.js";

export async function syncReconciledPaymentEvidence(
  client: PoolClient,
  context: { organizationId: string; actorId: string },
  attemptId: string,
): Promise<void> {
  const policy = await resolveOrganizationWorkflowPolicy(context.organizationId, client);
  const isSolopreneur = policy.operatingMode === "solopreneur";
  await client.query("select set_config('app.payment_evidence_update', 'on', true)");

  const docs = await client.query<{ commercial_document_id: string }>(
    `select distinct commercial_document_id from reconciliation_allocations
      where organization_id = $1 and reconciliation_id = $2 and commercial_document_id is not null`,
    [context.organizationId, attemptId],
  );
  for (const { commercial_document_id: docId } of docs.rows) {
    const docRes = await client.query<{
      type: string;
      gross_minor: string;
      payment_evidence_ref: string | null;
    }>(
      `select type::text, gross_minor::text, payment_evidence_ref
         from commercial_documents where organization_id = $1 and id = $2 for update`,
      [context.organizationId, docId],
    );
    const doc = docRes.rows[0];
    if (!doc || doc.type !== "purchase_invoice") continue;
    const reconciled = await lookupReconciledBankPayment(
      client,
      context.organizationId,
      "commercial_document",
      docId,
    );
    if (reconciled.paidMinor >= BigInt(doc.gross_minor) && reconciled.paidOn) {
      await client.query(
        `update commercial_documents set
           payment_method = case when payment_method = 'card' then 'card' else 'bank_transfer' end,
           paid_on = coalesce(paid_on, $3::date),
           payment_evidence_ref = coalesce(payment_evidence_ref, $4),
           updated_at = now()
         where organization_id = $1 and id = $2`,
        [context.organizationId, docId, reconciled.paidOn, reconciled.reference],
      );
    } else if (
      reconciled.paidMinor === 0n &&
      (doc.payment_evidence_ref ?? "").startsWith("bank_tx:")
    ) {
      await client.query(
        `update commercial_documents set payment_method = 'unpaid', paid_on = null, payment_evidence_ref = null, updated_at = now()
         where organization_id = $1 and id = $2`,
        [context.organizationId, docId],
      );
    }
    if (isSolopreneur) {
      await applySolopreneurPurchaseDocumentDefaults(
        client,
        context,
        docId,
        "Re-evaluated from bank reconciliation",
      );
    }
  }

  const exps = await client.query<{ expense_id: string }>(
    `select distinct expense_id from reconciliation_allocations
      where organization_id = $1 and reconciliation_id = $2 and expense_id is not null`,
    [context.organizationId, attemptId],
  );
  for (const { expense_id: expId } of exps.rows) {
    const expRes = await client.query<{
      gross_minor: string;
      payment_evidence_ref: string | null;
    }>(
      `select gross_minor::text, payment_evidence_ref
         from expenses where organization_id = $1 and id = $2 for update`,
      [context.organizationId, expId],
    );
    const exp = expRes.rows[0];
    if (!exp) continue;
    const reconciled = await lookupReconciledBankPayment(
      client,
      context.organizationId,
      "expense",
      expId,
    );
    if (reconciled.paidMinor >= BigInt(exp.gross_minor) && reconciled.paidOn) {
      await client.query(
        `update expenses set
           payment_method = case when payment_method = 'card' then 'card' else 'bank_transfer' end,
           paid_on = coalesce(paid_on, $3::date),
           payment_evidence_ref = coalesce(payment_evidence_ref, $4),
           updated_at = now()
         where organization_id = $1 and id = $2`,
        [context.organizationId, expId, reconciled.paidOn, reconciled.reference],
      );
    } else if (
      reconciled.paidMinor === 0n &&
      (exp.payment_evidence_ref ?? "").startsWith("bank_tx:")
    ) {
      await client.query(
        `update expenses set payment_method = 'unpaid', paid_on = null, payment_evidence_ref = null, updated_at = now()
         where organization_id = $1 and id = $2`,
        [context.organizationId, expId],
      );
    }
    if (isSolopreneur) {
      await applySolopreneurExpenseDefaults(
        client,
        context,
        expId,
        "Re-evaluated from bank reconciliation",
      );
    }
  }
}
