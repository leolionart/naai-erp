import { Injectable } from "@nestjs/common";
import type { RecordFreelancePayablePaymentRequest } from "@naai-erp/contracts";
import { validateFreelancePayment } from "@naai-erp/domain";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import type {
  ProjectFreelancePayableContext,
  ProjectFreelancePayableStore,
} from "./project-freelance-payable.types.js";
type Row = {
  id: string;
  expenseId: string;
  projectId: string;
  freelancerPartyId: string;
  expenseDate: string;
  dueDate: string;
  amountMinor: string;
  paidMinor: string;
  outstandingMinor: string;
  currency: string;
  description: string;
  state: "unpaid" | "partially_paid" | "paid";
  journalId: string;
  paymentJournalIds: string[];
  resourceVersion: string;
};
@Injectable()
export class PgProjectFreelancePayableStore implements ProjectFreelancePayableStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  async list(org: string, f: { projectId?: string; freelancerPartyId?: string; state?: string }) {
    const r = await this.pool.query<Row>(
      `select p.id,p.expense_id "expenseId",p.project_id "projectId",p.freelancer_party_id "freelancerPartyId",e.expense_date::text "expenseDate",p.due_date::text "dueDate",p.amount_minor::text "amountMinor",p.paid_minor::text "paidMinor",(p.amount_minor-p.paid_minor)::text "outstandingMinor",p.currency,e.business_purpose description,p.state,p.journal_id "journalId",coalesce(array_agg(pp.journal_id) filter(where pp.id is not null),'{}') "paymentJournalIds",p.version::text "resourceVersion" from project_freelance_payables p join expenses e on e.organization_id=p.organization_id and e.id=p.expense_id left join project_freelance_payable_payments pp on pp.organization_id=p.organization_id and pp.payable_id=p.id where p.organization_id=$1 and ($2::text is null or p.project_id=$2) and ($3::text is null or p.freelancer_party_id=$3) and ($4::text is null or p.state=$4) group by p.organization_id,p.id,e.expense_date,e.business_purpose order by p.due_date,p.created_at`,
      [org, f.projectId ?? null, f.freelancerPartyId ?? null, f.state ?? null],
    );
    return r.rows.map((x) => ({
      schemaVersion: 1,
      ...x,
      nextActions: x.state === "paid" ? [] : ["record_payment"],
    }));
  }
  async get(org: string, id: string) {
    return (await this.list(org, {})).find((row) => row.id === id);
  }
  async pay(
    c: ProjectFreelancePayableContext,
    id: string,
    input: RecordFreelancePayablePaymentRequest,
    key: string,
  ) {
    const db = await this.pool.connect();
    try {
      await db.query("begin");
      const hash = createHash("sha256").update(JSON.stringify({ id, input })).digest("hex");
      await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${c.organizationId}:${key}`,
      ]);
      const replay = await db.query(
        `select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2 for update`,
        [c.organizationId, key],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== hash) throw new Error("IDEMPOTENCY_CONFLICT");
        await db.query("commit");
        return { ...replay.rows[0].response_body, idempotencyReplayed: true };
      }
      const p = await db.query(
        `select p.*,e.counter_account_code,e.business_purpose from project_freelance_payables p join expenses e on e.organization_id=p.organization_id and e.id=p.expense_id where p.organization_id=$1 and p.id=$2 for update`,
        [c.organizationId, id],
      );
      const row = p.rows[0];
      if (!row) throw new Error("RESOURCE_NOT_FOUND");
      const amount = validateFreelancePayment(
        input.amountMinor,
        BigInt(row.amount_minor) - BigInt(row.paid_minor),
      );
      const period = await db.query(
        `select state from fiscal_periods where organization_id=$1 and $2::date between starts_on and ends_on`,
        [c.organizationId, input.paymentDate],
      );
      if (!period.rows[0]) throw new Error("FISCAL_PERIOD_NOT_FOUND");
      if (period.rows[0].state !== "open") throw new Error("FISCAL_PERIOD_NOT_OPEN");
      const fa = await db.query(
        `select ledger_account_code,currency,status from financial_accounts where organization_id=$1 and id=$2 for update`,
        [c.organizationId, input.financialAccountId],
      );
      if (!fa.rows[0] || fa.rows[0].status !== "active")
        throw new Error("FINANCIAL_ACCOUNT_NOT_AVAILABLE");
      if (fa.rows[0].currency !== row.currency) throw new Error("CURRENCY_MISMATCH");
      const journalId = randomUUID(),
        paymentId = randomUUID(),
        auditEventId = randomUUID();
      await db.query(
        `insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by) values($1,$2,$3,$4,$5,'posted',1,$6,now(),$6,$7,now(),$6)`,
        [
          c.organizationId,
          journalId,
          input.paymentDate,
          `Freelance payment ${id}`,
          row.currency,
          c.actorId,
          input.reason,
        ],
      );
      await db.query(
        `insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions) values($1,$2,1,$3,$4,null,$5,$6),($1,$2,2,$7,null,$4,$5,$6)`,
        [
          c.organizationId,
          journalId,
          row.counter_account_code,
          amount.toString(),
          row.business_purpose,
          { projectId: row.project_id, partyId: row.freelancer_party_id, payableId: id },
          fa.rows[0].ledger_account_code,
        ],
      );
      await db.query(
        `insert into project_freelance_payable_payments(organization_id,id,payable_id,financial_account_id,payment_date,amount_minor,journal_id,created_by,correlation_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          c.organizationId,
          paymentId,
          id,
          input.financialAccountId,
          input.paymentDate,
          amount.toString(),
          journalId,
          c.actorId,
          c.correlationId,
        ],
      );
      const paid = BigInt(row.paid_minor) + amount,
        state = paid === BigInt(row.amount_minor) ? "paid" : "partially_paid";
      await db.query(
        `update project_freelance_payables set paid_minor=$3,state=$4,version=version+1,updated_at=now() where organization_id=$1 and id=$2`,
        [c.organizationId, id, paid.toString(), state],
      );
      const result = {
        schemaVersion: 1,
        id,
        expenseId: row.expense_id,
        projectId: row.project_id,
        freelancerPartyId: row.freelancer_party_id,
        expenseDate: String(row.expense_date),
        dueDate: String(row.due_date),
        amountMinor: String(row.amount_minor),
        paidMinor: paid.toString(),
        outstandingMinor: (BigInt(row.amount_minor) - paid).toString(),
        currency: row.currency,
        description: row.business_purpose,
        state,
        journalId: row.journal_id,
        paymentJournalIds: [journalId],
        resourceVersion: (BigInt(row.version) + 1n).toString(),
        auditEventId,
        correlationId: c.correlationId,
        idempotencyReplayed: false,
        nextActions: state === "paid" ? [] : ["record_payment"],
      };
      await db.query(
        `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state) values($1,$2,'project_freelance_payable',$3,$4,'pay',$5,$6,$7,$8)`,
        [
          c.organizationId,
          auditEventId,
          id,
          result.resourceVersion,
          c.actorId,
          c.correlationId,
          { paidMinor: String(row.paid_minor), state: row.state },
          result,
        ],
      );
      await db.query(
        `insert into outbox_events(organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id) values($1,$2,'project_freelance_payable',$3,'project_freelance_payable.paid',1,$4,$5)`,
        [c.organizationId, randomUUID(), id, result, c.correlationId],
      );
      await db.query(
        `insert into api_idempotency_records(organization_id,idempotency_key,operation,request_hash,response_body) values($1,$2,'project_freelance_payable.pay',$3,$4)`,
        [c.organizationId, key, hash, result],
      );
      await db.query("commit");
      return result;
    } catch (e) {
      await db.query("rollback");
      throw e;
    } finally {
      db.release();
    }
  }
}
