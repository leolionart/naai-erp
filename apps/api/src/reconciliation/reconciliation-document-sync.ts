import type { PoolClient } from "pg";
import { syncReconciledPaymentEvidence } from "../payment-evidence/payment-evidence-evaluator.js";

export async function refreshReconciledDocumentsAndPaymentEvidence(
  c: PoolClient,
  context: { organizationId: string; actorId: string },
  attemptId: string,
): Promise<void> {
  const org = context.organizationId;
  const documents = await c.query<{ commercial_document_id: string }>(
    "select distinct commercial_document_id from reconciliation_allocations where organization_id=$1 and reconciliation_id=$2 and commercial_document_id is not null",
    [org, attemptId],
  );
  for (const { commercial_document_id: id } of documents.rows) {
    const result = await c.query<{ gross_minor: string; type: string; paid: string }>(
      `select d.gross_minor::text, d.type,
       coalesce((select sum(a.target_amount_minor)::text from reconciliation_allocations a join reconciliation_attempts r on r.organization_id=a.organization_id and r.id=a.reconciliation_id where a.organization_id=d.organization_id and a.commercial_document_id=d.id and r.state='reconciled'),'0') paid
       from commercial_documents d where d.organization_id=$1 and d.id=$2 for update`,
      [org, id],
    );
    const row = result.rows[0];
    if (!row) continue;
    const paid = BigInt(row.paid);
    const gross = BigInt(row.gross_minor);
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
  await syncReconciledPaymentEvidence(c, context, attemptId);
}
