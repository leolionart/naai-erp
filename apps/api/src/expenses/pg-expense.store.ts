import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg, { type PoolClient } from "pg";
import type { CreateExpenseInput, ExpenseContext, ExpenseReviewInput } from "./expense.types.js";

type StoredExpense = {
  id: string;
  expense_class: string;
  state: string;
  expense_date: string;
  currency: string;
  net_minor: string;
  vat_minor: string;
  gross_minor: string;
  counter_account_code: string;
  created_by: string;
  version: string;
  employee_party_id: string | null;
  payee_party_id: string | null;
  evidence_checklist: Record<string, boolean>;
};
const NEXT: Record<string, Record<string, string>> = {
  draft: { submit: "submitted" },
  submitted: {
    "mark-evidence-pending": "evidence_pending",
    approve: "approved",
    reject: "rejected",
  },
  evidence_pending: { submit: "submitted", reject: "rejected" },
  approved: { post: "posted" },
};

@Injectable()
export class PgExpenseStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  async list(
    org: string,
    filters: { state?: string; expenseClass?: string; payeePartyId?: string },
  ) {
    const r = await this.pool.query(
      `select * from expenses where organization_id=$1 and ($2::text is null or state::text=$2) and ($3::text is null or expense_class::text=$3) and ($4::text is null or payee_party_id=$4) order by expense_date desc,id`,
      [org, filters.state ?? null, filters.expenseClass ?? null, filters.payeePartyId ?? null],
    );
    return r.rows;
  }
  async get(org: string, id: string) {
    const r = await this.pool.query(
      `select e.*,coalesce(json_agg(jsonb_build_object('lineNumber',l.line_number,'description',l.description,'netMinor',l.net_minor::text,'vatMinor',l.vat_minor::text,'grossMinor',l.gross_minor::text,'postingAccountCode',l.posting_account_code,'vatAccountCode',l.vat_account_code,'managementState',l.management_state,'citState',l.cit_state,'vatState',l.vat_state,'citEligibleMinor',l.cit_eligible_minor::text,'vatEligibleMinor',l.vat_eligible_minor::text,'dimensions',l.dimensions,'allocations',(select coalesce(json_agg(a order by a.allocation_number),'[]') from expense_allocations a where a.organization_id=l.organization_id and a.expense_id=l.expense_id and a.line_number=l.line_number)) order by l.line_number) filter(where l.line_number is not null),'[]') lines from expenses e left join expense_lines l on l.organization_id=e.organization_id and l.expense_id=e.id where e.organization_id=$1 and e.id=$2 group by e.organization_id,e.id`,
      [org, id],
    );
    return r.rows[0];
  }
  async create(context: ExpenseContext, input: CreateExpenseInput, key: string) {
    const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const c = await this.pool.connect();
    try {
      await c.query("begin");
      const replay = await this.replay(c, context.organizationId, key, hash);
      if (replay) {
        await c.query("rollback");
        return { ...replay, idempotencyReplayed: true };
      }
      const id = input.id ?? randomUUID();
      await c.query(
        `insert into expenses(organization_id,id,expense_class,state,payee_party_id,employee_party_id,expense_date,service_period_start,service_period_end,business_purpose,currency,net_minor,vat_minor,gross_minor,counter_account_code,cit_state,vat_state,evidence_checklist,created_by) values($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'unreviewed',$15,$16,$17)`,
        [
          context.organizationId,
          id,
          input.expenseClass,
          input.payeePartyId ?? null,
          input.employeePartyId ?? null,
          input.expenseDate,
          input.servicePeriodStart ?? null,
          input.servicePeriodEnd ?? null,
          input.businessPurpose,
          input.currency,
          input.netMinor,
          input.vatMinor,
          input.grossMinor,
          input.counterAccountCode,
          input.expenseClass === "non_documented" ? "ineligible" : "unreviewed",
          input.evidenceChecklist ?? {},
          context.actorId,
        ],
      );
      for (const [index, line] of input.lines.entries()) {
        await c.query(
          `insert into expense_lines(organization_id,expense_id,line_number,description,net_minor,vat_minor,gross_minor,posting_account_code,vat_account_code,management_state,cit_state,vat_state,cit_eligible_minor,vat_eligible_minor,dimensions) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            context.organizationId,
            id,
            index + 1,
            line.description,
            line.netMinor,
            line.vatMinor,
            line.grossMinor,
            line.postingAccountCode,
            line.vatAccountCode ?? null,
            line.managementState ?? "unreviewed",
            line.citState ?? "unreviewed",
            input.expenseClass === "non_documented"
              ? "ineligible"
              : (line.vatState ?? "unreviewed"),
            line.citEligibleMinor ?? "0",
            line.vatEligibleMinor ?? "0",
            line.dimensions ?? {},
          ],
        );
        for (const [aIndex, a] of line.allocations.entries())
          await c.query(
            `insert into expense_allocations(organization_id,expense_id,line_number,allocation_number,amount_minor,dimensions) values($1,$2,$3,$4,$5,$6)`,
            [
              context.organizationId,
              id,
              index + 1,
              aIndex + 1,
              a.amountMinor,
              { ...a.dimensions, allocationId: a.id },
            ],
          );
      }
      const audit = randomUUID(),
        outbox = randomUUID();
      await c.query(
        `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state) values($1,$2,'expense',$3,1,'create',$4,$5,$6)`,
        [
          context.organizationId,
          audit,
          id,
          context.actorId,
          context.correlationId,
          { state: "draft", expenseClass: input.expenseClass },
        ],
      );
      await c.query(
        `insert into outbox_events(organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id) values($1,$2,'expense',$3,'expense.created',1,$4,$5)`,
        [
          context.organizationId,
          outbox,
          id,
          { expenseId: id, state: "draft", expenseClass: input.expenseClass },
          context.correlationId,
        ],
      );
      const response = {
        expenseId: id,
        state: "draft",
        resourceVersion: "1",
        auditEventId: audit,
        outboxEventId: outbox,
        nextActions: ["submit"],
      };
      await this.save(c, context.organizationId, key, "expense:create", hash, response);
      await c.query("commit");
      return { ...response, idempotencyReplayed: false };
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  }
  async review(context: ExpenseContext, id: string, input: ExpenseReviewInput, key: string) {
    const hash = createHash("sha256").update(JSON.stringify({ id, input })).digest("hex");
    const c = await this.pool.connect();
    try {
      await c.query("begin");
      const replay = await this.replay(c, context.organizationId, key, hash);
      if (replay) {
        await c.query("rollback");
        return { ...replay, idempotencyReplayed: true };
      }
      const expense = await this.lock(c, context.organizationId, id);
      if (["posted", "rejected"].includes(expense.state))
        throw new Error("EXPENSE_FINAL_IMMUTABLE");
      const line = await c.query<{
        gross_minor: string;
        vat_minor: string;
        management_state: string;
        cit_state: string;
        vat_state: string;
      }>(
        `select gross_minor::text,vat_minor::text,management_state,cit_state,vat_state from expense_lines where organization_id=$1 and expense_id=$2 and line_number=$3 for update`,
        [context.organizationId, id, input.lineNumber],
      );
      if (!line.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      const eligible = BigInt(input.eligibleMinor ?? "0");
      const maximum =
        input.axis === "vat" ? BigInt(line.rows[0].vat_minor) : BigInt(line.rows[0].gross_minor);
      if (eligible < 0n || eligible > maximum) throw new Error("ELIGIBILITY_AMOUNT_INVALID");
      if (
        expense.expense_class === "non_documented" &&
        input.axis === "vat" &&
        (input.state !== "ineligible" || eligible !== 0n)
      )
        throw new Error("VAT_EVIDENCE_REQUIRED");
      const allowed =
        input.axis === "management"
          ? ["valid", "invalid", "accountant_override"]
          : ["eligible", "partially_eligible", "ineligible", "accountant_override"];
      if (!allowed.includes(input.state)) throw new Error("VALIDATION_FAILED");
      const column = input.axis === "management" ? "management_state" : `${input.axis}_state`;
      const amountColumn = input.axis === "management" ? null : `${input.axis}_eligible_minor`;
      await c.query(
        `update expense_lines set ${column}=$4,${amountColumn ? `${amountColumn}=$5,` : ""}reviewed_by=$6,reviewed_at=now(),review_reason=$7,review_reference=$8 where organization_id=$1 and expense_id=$2 and line_number=$3`,
        [
          context.organizationId,
          id,
          input.lineNumber,
          input.state,
          eligible.toString(),
          context.actorId,
          input.reason,
          input.reference ?? null,
        ],
      );
      await this.refreshSummary(c, context.organizationId, id);
      const version = (BigInt(expense.version) + 1n).toString();
      await c.query(
        "update expenses set version=version+1,updated_at=now() where organization_id=$1 and id=$2",
        [context.organizationId, id],
      );
      const event = randomUUID(),
        audit = randomUUID(),
        outbox = randomUUID();
      await c.query(
        `insert into expense_events(organization_id,id,expense_id,action,actor_id,reason,correlation_id,details) values($1,$2,$3,'review',$4,$5,$6,$7)`,
        [
          context.organizationId,
          event,
          id,
          context.actorId,
          input.reason,
          context.correlationId,
          {
            axis: input.axis,
            lineNumber: input.lineNumber,
            state: input.state,
            eligibleMinor: eligible.toString(),
            reference: input.reference ?? null,
          },
        ],
      );
      await c.query(
        `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state) values($1,$2,'expense',$3,$4,'review',$5,$6,$7,$8)`,
        [
          context.organizationId,
          audit,
          id,
          version,
          context.actorId,
          context.correlationId,
          { axis: input.axis },
          { axis: input.axis, state: input.state },
        ],
      );
      await c.query(
        `insert into outbox_events(organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id) values($1,$2,'expense',$3,'expense.reviewed',1,$4,$5)`,
        [
          context.organizationId,
          outbox,
          id,
          { expenseId: id, axis: input.axis, lineNumber: input.lineNumber, state: input.state },
          context.correlationId,
        ],
      );
      const response = {
        expenseId: id,
        state: expense.state,
        axis: input.axis,
        reviewState: input.state,
        resourceVersion: version,
        eventId: event,
        auditEventId: audit,
        outboxEventId: outbox,
        nextActions: Object.keys(NEXT[expense.state] ?? {}),
      };
      await this.save(c, context.organizationId, key, "expense:review", hash, response);
      await c.query("commit");
      return { ...response, idempotencyReplayed: false };
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  }
  async transition(
    context: ExpenseContext,
    id: string,
    action: string,
    reason: string,
    missingEvidence: string[],
    key: string,
  ) {
    const hash = createHash("sha256")
      .update(JSON.stringify({ id, action, reason, missingEvidence }))
      .digest("hex");
    const c = await this.pool.connect();
    try {
      await c.query("begin");
      const replay = await this.replay(c, context.organizationId, key, hash);
      if (replay) {
        await c.query("rollback");
        return { ...replay, idempotencyReplayed: true };
      }
      const e = await this.lock(c, context.organizationId, id);
      const next = NEXT[e.state]?.[action];
      if (!next) throw new Error("INVALID_EXPENSE_TRANSITION");
      if (action === "approve") {
        if (e.created_by === context.actorId)
          await this.selfApproval(c, context.organizationId, BigInt(e.gross_minor));
        await this.assertReviewReady(c, context.organizationId, e);
      }
      let journalId: string | undefined;
      if (action === "post") {
        await this.period(c, context, e.expense_date);
        journalId = await this.postJournal(c, context, e);
      }
      const version = (BigInt(e.version) + 1n).toString();
      await c.query(
        `update expenses set state=$3,version=version+1,updated_at=now(),approved_by=case when $4='approve' then $5 else approved_by end,approved_at=case when $4='approve' then now() else approved_at end,posted_by=case when $4='post' then $5 else posted_by end,posted_at=case when $4='post' then now() else posted_at end,journal_id=coalesce($6::text,journal_id),evidence_checklist=case when $4='mark-evidence-pending' then evidence_checklist||$7::jsonb else evidence_checklist end where organization_id=$1 and id=$2`,
        [
          context.organizationId,
          id,
          next,
          action,
          context.actorId,
          journalId ?? null,
          Object.fromEntries(missingEvidence.map((x) => [x, false])),
        ],
      );
      const event = randomUUID(),
        audit = randomUUID(),
        outbox = randomUUID();
      await c.query(
        `insert into expense_events(organization_id,id,expense_id,action,from_state,to_state,actor_id,reason,correlation_id,details) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          context.organizationId,
          event,
          id,
          action,
          e.state,
          next,
          context.actorId,
          reason,
          context.correlationId,
          { missingEvidence, journalId: journalId ?? null },
        ],
      );
      await c.query(
        `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state) values($1,$2,'expense',$3,$4,$5,$6,$7,$8,$9)`,
        [
          context.organizationId,
          audit,
          id,
          version,
          action,
          context.actorId,
          context.correlationId,
          { state: e.state },
          { state: next, journalId: journalId ?? null },
        ],
      );
      await c.query(
        `insert into outbox_events(organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id) values($1,$2,'expense',$3,$4,1,$5,$6)`,
        [
          context.organizationId,
          outbox,
          id,
          `expense.${next}`,
          { expenseId: id, state: next, journalId: journalId ?? null },
          context.correlationId,
        ],
      );
      const response = {
        expenseId: id,
        state: next,
        resourceVersion: version,
        journalId: journalId ?? null,
        eventId: event,
        auditEventId: audit,
        outboxEventId: outbox,
        nextActions: Object.keys(NEXT[next] ?? {}),
      };
      await this.save(c, context.organizationId, key, `expense:${action}`, hash, response);
      await c.query("commit");
      return { ...response, idempotencyReplayed: false };
    } catch (err) {
      await c.query("rollback");
      throw err;
    } finally {
      c.release();
    }
  }
  private async lock(c: PoolClient, org: string, id: string) {
    const r = await c.query<StoredExpense>(
      `select id,expense_class,state,expense_date::text,currency,net_minor::text,vat_minor::text,gross_minor::text,counter_account_code,created_by,version::text,employee_party_id,payee_party_id,evidence_checklist from expenses where organization_id=$1 and id=$2 for update`,
      [org, id],
    );
    if (!r.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    return r.rows[0];
  }
  private async assertReviewReady(c: PoolClient, organizationId: string, e: StoredExpense) {
    const r = await c.query<{
      management_state: string;
      cit_state: string;
      vat_state: string;
      vat_eligible_minor: string;
    }>(
      "select management_state,cit_state,vat_state,vat_eligible_minor::text from expense_lines where organization_id=$1 and expense_id=$2",
      [organizationId, e.id],
    );
    if (
      r.rows.length === 0 ||
      r.rows.some(
        (line) =>
          !["valid", "accountant_override"].includes(line.management_state) ||
          line.cit_state === "unreviewed" ||
          line.vat_state === "unreviewed",
      )
    )
      throw new Error("EXPENSE_REVIEW_INCOMPLETE");
    if (
      e.expense_class === "non_documented" &&
      r.rows.some((line) => line.vat_state !== "ineligible" || line.vat_eligible_minor !== "0")
    )
      throw new Error("VAT_EVIDENCE_REQUIRED");
    const required =
      e.expense_class === "invoice_backed"
        ? ["invoice"]
        : ["contract_backed", "freelancer"].includes(e.expense_class)
          ? ["contract", "acceptance"]
          : [];
    if (required.some((name) => e.evidence_checklist[name] !== true))
      throw new Error("EXPENSE_EVIDENCE_INCOMPLETE");
  }
  private async refreshSummary(c: PoolClient, org: string, id: string) {
    await c.query(
      `update expenses set cit_state=(select case when bool_or(cit_state='unreviewed') then 'unreviewed'::eligibility_state when bool_or(cit_state='accountant_override') then 'accountant_override'::eligibility_state when bool_or(cit_state='partially_eligible') or (bool_or(cit_state='eligible') and bool_or(cit_state='ineligible')) then 'partially_eligible'::eligibility_state when bool_and(cit_state='eligible') then 'eligible'::eligibility_state else 'ineligible'::eligibility_state end from expense_lines where organization_id=$1 and expense_id=$2),vat_state=(select case when bool_or(vat_state='unreviewed') then 'unreviewed'::eligibility_state when bool_or(vat_state='accountant_override') then 'accountant_override'::eligibility_state when bool_or(vat_state='partially_eligible') or (bool_or(vat_state='eligible') and bool_or(vat_state='ineligible')) then 'partially_eligible'::eligibility_state when bool_and(vat_state='eligible') then 'eligible'::eligibility_state else 'ineligible'::eligibility_state end from expense_lines where organization_id=$1 and expense_id=$2) where organization_id=$1 and id=$2`,
      [org, id],
    );
  }
  private async postJournal(c: PoolClient, context: ExpenseContext, e: StoredExpense) {
    const journalId = randomUUID();
    const lines = await c.query<{
      line_number: number;
      description: string;
      net_minor: string;
      vat_minor: string;
      posting_account_code: string;
      vat_account_code: string | null;
      vat_eligible_minor: string;
      dimensions: Record<string, string>;
    }>(
      `select line_number,description,net_minor::text,vat_minor::text,posting_account_code,vat_account_code,vat_eligible_minor::text,dimensions from expense_lines where organization_id=$1 and expense_id=$2`,
      [context.organizationId, e.id],
    );
    const out: Array<{
      account: string;
      debit?: bigint;
      credit?: bigint;
      description: string;
      dimensions: Record<string, string>;
    }> = [];
    for (const l of lines.rows) {
      const a = await c.query<{ amount_minor: string; dimensions: Record<string, string> }>(
        "select amount_minor::text,dimensions from expense_allocations where organization_id=$1 and expense_id=$2 and line_number=$3 order by allocation_number",
        [context.organizationId, e.id, l.line_number],
      );
      if (a.rows.reduce((s, x) => s + BigInt(x.amount_minor), 0n) !== BigInt(l.net_minor))
        throw new Error("EXPENSE_ALLOCATION_MISMATCH");
      let vatAllocated = 0n,
        ineligibleAllocated = 0n;
      const eligibleVat = BigInt(l.vat_eligible_minor),
        ineligibleVat = BigInt(l.vat_minor) - eligibleVat;
      for (const [index, x] of a.rows.entries()) {
        const net = BigInt(x.amount_minor);
        const eligible =
          index === a.rows.length - 1
            ? eligibleVat - vatAllocated
            : (eligibleVat * net) / BigInt(l.net_minor);
        vatAllocated += eligible;
        const ineligible =
          index === a.rows.length - 1
            ? ineligibleVat - ineligibleAllocated
            : (ineligibleVat * net) / BigInt(l.net_minor);
        ineligibleAllocated += ineligible;
        const dims = {
          ...l.dimensions,
          ...x.dimensions,
          sourceExpenseId: e.id,
          sourceLineNumber: String(l.line_number),
        };
        out.push({
          account: l.posting_account_code,
          debit: net + ineligible,
          description: l.description,
          dimensions: dims,
        });
        if (eligible > 0n)
          out.push({
            account: l.vat_account_code!,
            debit: eligible,
            description: `VAT ${l.description}`,
            dimensions: dims,
          });
      }
    }
    out.push({
      account: e.counter_account_code,
      credit: BigInt(e.gross_minor),
      description: e.id,
      dimensions: {
        payeePartyId: e.payee_party_id ?? "",
        employeePartyId: e.employee_party_id ?? "",
        sourceExpenseId: e.id,
      },
    });
    const debit = out.reduce((s, x) => s + (x.debit ?? 0n), 0n),
      credit = out.reduce((s, x) => s + (x.credit ?? 0n), 0n);
    if (debit !== credit) throw new Error("JOURNAL_UNBALANCED");
    await c.query(
      `insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by) values($1,$2,$3,$4,$5,'posted',2,$6,now(),$6,'Expense workflow',now(),$6)`,
      [
        context.organizationId,
        journalId,
        e.expense_date,
        `Expense ${e.id}`,
        e.currency,
        context.actorId,
      ],
    );
    for (const [index, x] of out.entries())
      await c.query(
        `insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions) values($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          context.organizationId,
          journalId,
          index + 1,
          x.account,
          x.debit?.toString() ?? null,
          x.credit?.toString() ?? null,
          x.description,
          x.dimensions,
        ],
      );
    await c.query(
      `insert into outbox_events(organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id) values($1,$2,'journal',$3,'journal.posted',1,$4,$5)`,
      [
        context.organizationId,
        randomUUID(),
        journalId,
        { journalId, sourceExpenseId: e.id },
        context.correlationId,
      ],
    );
    return journalId;
  }
  private async selfApproval(c: PoolClient, org: string, total: bigint) {
    const p = await c.query<{
      allow_self_approval: boolean;
      self_approval_max_minor: string | null;
    }>(
      "select allow_self_approval,self_approval_max_minor from accounting_workflow_policies where organization_id=$1",
      [org],
    );
    if (
      !p.rows[0]?.allow_self_approval ||
      total > BigInt(p.rows[0].self_approval_max_minor ?? "-1")
    )
      throw new Error("MAKER_CHECKER_VIOLATION");
  }
  private async period(c: PoolClient, context: ExpenseContext, date: string) {
    const p = await c.query<{ state: string }>(
      "select state from fiscal_periods where organization_id=$1 and $2::date between starts_on and ends_on",
      [context.organizationId, date],
    );
    if (p.rows.length !== 1)
      throw new Error(p.rows.length ? "FISCAL_PERIOD_AMBIGUOUS" : "FISCAL_PERIOD_NOT_FOUND");
    if (p.rows[0]!.state === "hard_locked") throw new Error("PERIOD_HARD_LOCKED");
    if (
      p.rows[0]!.state === "soft_locked" &&
      !context.roles.some((r) => ["owner", "finance_admin"].includes(r))
    )
      throw new Error("PERIOD_SOFT_LOCKED");
  }
  private async replay(c: PoolClient, org: string, key: string, hash: string) {
    await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`${org}:${key}`]);
    const r = await c.query<{ request_hash: string; response_body: Record<string, unknown> }>(
      "select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2 for update",
      [org, key],
    );
    if (!r.rows[0]) return undefined;
    if (r.rows[0].request_hash !== hash) throw new Error("IDEMPOTENCY_CONFLICT");
    return r.rows[0].response_body;
  }
  private save(
    c: PoolClient,
    org: string,
    key: string,
    operation: string,
    hash: string,
    response: unknown,
  ) {
    return c.query(
      "insert into api_idempotency_records(organization_id,idempotency_key,operation,request_hash,response_body) values($1,$2,$3,$4,$5)",
      [org, key, operation, hash, response],
    );
  }
}
