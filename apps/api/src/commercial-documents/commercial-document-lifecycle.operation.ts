import { createHash, randomUUID } from "node:crypto";
import { applySolopreneurPurchaseDocumentDefaults } from "../payment-evidence/payment-evidence-evaluator.js";
import type {
  CommercialDocumentAction,
  CommercialDocumentContext,
} from "./commercial-document.types.js";
import { NEXT, type StoredDocument } from "./pg-commercial-document.store.shared.js";
import type { PgCommercialDocumentStore } from "./pg-commercial-document.store.js";

export async function transitionOperation(
  this: PgCommercialDocumentStore,
  context: CommercialDocumentContext,
  id: string,
  action: CommercialDocumentAction,
  reason: string,
  idempotencyKey: string,
) {
  const requestHash = createHash("sha256")
    .update(JSON.stringify({ id, action, reason }))
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
    const found = await client.query<StoredDocument>(
      `select id,type,state,document_date::text,currency,party_id,document_number,net_minor::text,tax_minor::text,
        gross_minor::text,control_account_code,funding_financial_account_id,original_document_id,created_by,version::text
       from commercial_documents where organization_id=$1 and id=$2 for update`,
      [context.organizationId, id],
    );
    const document = found.rows[0];
    if (!document) throw new Error("RESOURCE_NOT_FOUND");
    let next = NEXT[document.type][document.state]?.[action];
    if (!next) throw new Error("INVALID_DOCUMENT_TRANSITION");
    if (action === "approve" && document.created_by === context.actorId)
      await this.assertSelfApproval(client, context, BigInt(document.gross_minor));
    const solopreneurOwner =
      document.type === "purchase_invoice" &&
      context.roles.includes("owner") &&
      (await this.operatingMode(client, context.organizationId)) === "solopreneur";
    if (action === "approve" && solopreneurOwner) {
      await applySolopreneurPurchaseDocumentDefaults(
        client,
        context,
        id,
        "Solopreneur default on approval",
      );
    }
    let journalId: string | undefined;
    if (action === "issue" || action === "post") {
      if (document.type === "sales_invoice")
        await this.assertSalesContractCoverage(client, context.organizationId, document);
      await this.assertPostingPeriod(client, context, document.document_date);
      if (document.type === "purchase_invoice" && document.funding_financial_account_id) {
        const funding = await client.query<{ ledger_account_code: string }>(
          `select ledger_account_code from financial_accounts where organization_id=$1 and id=$2
           and currency=$3 and status='active' for update`,
          [context.organizationId, document.funding_financial_account_id, document.currency],
        );
        if (!funding.rows[0]) throw new Error("PURCHASE_FUNDING_ACCOUNT_NOT_AVAILABLE");
        document.control_account_code = funding.rows[0].ledger_account_code;
      }
      if (action === "post" && solopreneurOwner) {
        await applySolopreneurPurchaseDocumentDefaults(
          client,
          context,
          id,
          "Solopreneur default on posting",
        );
      }
      journalId = await this.postDocumentJournal(client, context, document);
      if (document.type === "purchase_invoice" && action === "post") {
        if (document.funding_financial_account_id) next = "paid";
      }
    }
    const version = (BigInt(document.version) + 1n).toString();
    await client.query(
      `update commercial_documents set state=$3,version=version+1,updated_at=now(),control_account_code=$7,
        draft_reasons=case when $4 in ('issue','post') then '[]'::jsonb else draft_reasons end,
        approved_by=case when $4='approve' then $5 else approved_by end,
        approved_at=case when $4='approve' then now() else approved_at end,
        issued_or_posted_by=case when $4 in ('issue','post') then $5 else issued_or_posted_by end,
        issued_or_posted_at=case when $4 in ('issue','post') then now() else issued_or_posted_at end,
        journal_id=coalesce($6::text,journal_id)
       where organization_id=$1 and id=$2`,
      [
        context.organizationId,
        id,
        next,
        action,
        context.actorId,
        journalId ?? null,
        document.control_account_code,
      ],
    );
    const eventId = randomUUID();
    const auditEventId = randomUUID();
    const outboxEventId = randomUUID();
    await client.query(
      `insert into commercial_document_events
       (organization_id,id,document_id,from_state,to_state,actor_id,reason,correlation_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        context.organizationId,
        eventId,
        id,
        document.state,
        next,
        context.actorId,
        reason,
        context.correlationId,
      ],
    );
    await client.query(
      `insert into resource_audit_events
       (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
       values ($1,$2,'commercial_document',$3,$4,$5,$6,$7,$8,$9)`,
      [
        context.organizationId,
        auditEventId,
        id,
        version,
        action,
        context.actorId,
        context.correlationId,
        { state: document.state },
        { state: next, journalId: journalId ?? null },
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
        `${document.type}.${next}`,
        { documentId: id, type: document.type, state: next, journalId: journalId ?? null },
        context.correlationId,
      ],
    );
    const response = {
      documentId: id,
      type: document.type,
      state: next,
      resourceVersion: version,
      journalId: journalId ?? null,
      eventId,
      auditEventId,
      outboxEventId,
      nextActions: this.nextActions(document.type, next),
    };
    await this.saveReplay(
      client,
      context.organizationId,
      idempotencyKey,
      `commercial-document:${action}`,
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
