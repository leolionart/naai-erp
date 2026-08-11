import { Injectable } from "@nestjs/common";
import type { CreateCustomerReceiptRequest } from "@naai-erp/contracts";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import type { CustomerReceiptContext, CustomerReceiptStore } from "./customer-receipt.types.js";

type CustomerReceiptListRow = Readonly<Record<string, unknown> & { id: string }>;
type ComputedAllocation = Readonly<{
  salesInvoiceId: string;
  amountMinor: string;
  controlAccountCode: string;
  outstandingAfter: bigint;
}>;

@Injectable()
export class PgCustomerReceiptStore implements CustomerReceiptStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  async list(org: string) {
    const r = await this.pool.query<CustomerReceiptListRow>(
      `select r.*,coalesce(json_agg(json_build_object('id',a.id,'salesInvoiceId',a.sales_invoice_id,'amountMinor',a.amount_minor::text)) filter(where a.id is not null),'[]') allocations from customer_receipts r left join customer_receipt_allocations a on a.organization_id=r.organization_id and a.receipt_id=r.id where r.organization_id=$1 group by r.organization_id,r.id order by r.receipt_date desc,r.created_at desc`,
      [org],
    );
    return r.rows;
  }
  async get(org: string, id: string) {
    const x = (await this.list(org)).find((row) => row.id === id);
    return x;
  }
  async create(context: CustomerReceiptContext, input: CreateCustomerReceiptRequest, key: string) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${context.organizationId}:${key}`,
      ]);
      const old = await client.query(
        `select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2 for update`,
        [context.organizationId, key],
      );
      if (old.rows[0]) {
        if (old.rows[0].request_hash !== hash) throw new Error("IDEMPOTENCY_CONFLICT");
        await client.query("commit");
        return { ...old.rows[0].response_body, idempotencyReplayed: true };
      }
      const period = await client.query(
        `select state from fiscal_periods where organization_id=$1 and $2::date between starts_on and ends_on`,
        [context.organizationId, input.receiptDate],
      );
      if (!period.rows[0]) throw new Error("FISCAL_PERIOD_NOT_FOUND");
      if (period.rows[0].state !== "open") throw new Error("FISCAL_PERIOD_NOT_OPEN");
      const fa = await client.query(
        `select ledger_account_code,currency,status from financial_accounts where organization_id=$1 and id=$2 for update`,
        [context.organizationId, input.financialAccountId],
      );
      if (!fa.rows[0] || fa.rows[0].status !== "active")
        throw new Error("FINANCIAL_ACCOUNT_NOT_AVAILABLE");
      if (fa.rows[0].currency !== input.currency) throw new Error("CURRENCY_MISMATCH");
      let customerId: string | undefined;
      const computed: ComputedAllocation[] = [];
      for (const a of input.allocations) {
        const d = await client.query(
          `select id,party_id,currency,gross_minor::text,state,control_account_code from commercial_documents where organization_id=$1 and id=$2 and type='sales_invoice' for update`,
          [context.organizationId, a.salesInvoiceId],
        );
        const row = d.rows[0];
        if (!row || !["issued", "partially_paid"].includes(row.state))
          throw new Error("SALES_INVOICE_NOT_ELIGIBLE");
        if (row.currency !== input.currency) throw new Error("CURRENCY_MISMATCH");
        if (customerId && customerId !== row.party_id)
          throw new Error("CUSTOMER_RECEIPT_CUSTOMER_MISMATCH");
        customerId = row.party_id;
        const used = await client.query(
          `select coalesce((select sum(target_amount_minor) from reconciliation_allocations where organization_id=$1 and commercial_document_id=$2),0)+coalesce((select sum(amount_minor) from customer_receipt_allocations where organization_id=$1 and sales_invoice_id=$2),0) used`,
          [context.organizationId, a.salesInvoiceId],
        );
        const outstanding = BigInt(row.gross_minor) - BigInt(used.rows[0].used);
        if (BigInt(a.amountMinor) > outstanding)
          throw new Error("CUSTOMER_RECEIPT_OVER_ALLOCATION");
        computed.push({
          ...a,
          controlAccountCode: row.control_account_code,
          outstandingAfter: outstanding - BigInt(a.amountMinor),
        });
      }
      const id = input.id ?? randomUUID(),
        journalId = randomUUID(),
        auditEventId = randomUUID();
      await client.query(
        `insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by) values($1,$2,$3,$4,$5,'posted',1,$6,now(),$6,$7,now(),$6)`,
        [
          context.organizationId,
          journalId,
          input.receiptDate,
          input.description,
          input.currency,
          context.actorId,
          input.reason,
        ],
      );
      await client.query(
        `insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions) values($1,$2,1,$3,$4,null,$5,$6)`,
        [
          context.organizationId,
          journalId,
          fa.rows[0].ledger_account_code,
          input.amountMinor,
          input.description,
          { partyId: customerId, customerReceiptId: id },
        ],
      );
      let line = 2;
      const allocations = [];
      for (const a of computed) {
        const aid = randomUUID();
        await client.query(
          `insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions) values($1,$2,$3,$4,null,$5,$6,$7)`,
          [
            context.organizationId,
            journalId,
            line++,
            a.controlAccountCode,
            a.amountMinor,
            input.description,
            { partyId: customerId, documentId: a.salesInvoiceId, customerReceiptId: id },
          ],
        );
        await client.query(
          `insert into customer_receipt_allocations(organization_id,id,receipt_id,sales_invoice_id,amount_minor) values($1,$2,$3,$4,$5)`,
          [context.organizationId, aid, id, a.salesInvoiceId, a.amountMinor],
        );
        const state = a.outstandingAfter === 0n ? "paid" : "partially_paid";
        await client.query(
          `update commercial_documents set state=$3,version=version+1,updated_at=now() where organization_id=$1 and id=$2`,
          [context.organizationId, a.salesInvoiceId, state],
        );
        allocations.push({
          id: aid,
          salesInvoiceId: a.salesInvoiceId,
          amountMinor: a.amountMinor,
          invoiceState: state,
          invoiceOutstandingMinor: a.outstandingAfter.toString(),
        });
      }
      await client.query(
        `insert into customer_receipts(organization_id,id,financial_account_id,receipt_date,amount_minor,currency,description,journal_id,customer_id,created_by,correlation_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          context.organizationId,
          id,
          input.financialAccountId,
          input.receiptDate,
          input.amountMinor,
          input.currency,
          input.description,
          journalId,
          customerId,
          context.actorId,
          context.correlationId,
        ],
      );
      const result = {
        schemaVersion: 1,
        id,
        financialAccountId: input.financialAccountId,
        receiptDate: input.receiptDate,
        amountMinor: input.amountMinor,
        currency: input.currency,
        description: input.description,
        state: "posted",
        journalId,
        customerId,
        allocations,
        resourceVersion: "1",
        auditEventId,
        correlationId: context.correlationId,
        idempotencyReplayed: false,
        nextActions: [],
      };
      await client.query(
        `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state) values($1,$2,'customer_receipt',$3,1,'create',$4,$5,null,$6)`,
        [context.organizationId, auditEventId, id, context.actorId, context.correlationId, result],
      );
      await client.query(
        `insert into outbox_events(organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id) values($1,$2,'customer_receipt',$3,'customer_receipt.posted',1,$4,$5)`,
        [context.organizationId, randomUUID(), id, result, context.correlationId],
      );
      await client.query(
        `insert into api_idempotency_records(organization_id,idempotency_key,operation,request_hash,response_body) values($1,$2,'customer_receipt.create',$3,$4)`,
        [context.organizationId, key, hash, result],
      );
      await client.query("commit");
      return result;
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }
}
