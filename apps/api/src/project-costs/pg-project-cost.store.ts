import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg, { type PoolClient } from "pg";
import type { ProjectCostContext } from "./project-cost.types.js";
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
@Injectable()
export class PgProjectCostStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  async listCosts(org: string, projectId?: string) {
    const purchases = await this.pool.query(
      `select 'purchase:'||a.document_id||':'||a.line_number||':'||a.allocation_number id,
        a.dimensions->>'projectId' "projectId",'vendor_service' "costClass",'ledger' basis,
        d.document_date::text "effectiveOn",d.currency,a.amount_minor::text "amountMinor",
        a.amount_minor::text "baseAmountMinor",l.primary_account_code "ledgerAccountCode",
        d.id "sourceId",a.line_number::text "sourceLineId",a.allocation_number::text "sourceAllocationId",
        d.journal_id "journalId"
       from commercial_document_allocations a
       join commercial_documents d on d.organization_id=a.organization_id and d.id=a.document_id
       join commercial_document_lines l on l.organization_id=a.organization_id and l.document_id=a.document_id and l.line_number=a.line_number
       where a.organization_id=$1 and d.type='purchase_invoice' and d.state in('posted','partially_paid','paid')
         and ($2::text is null or a.dimensions->>'projectId'=$2)
       order by d.document_date desc,d.id,a.line_number,a.allocation_number`,
      [org, projectId ?? null],
    );
    return {
      items: purchases.rows.map((row) => ({
        id: row.id,
        projectId: row.projectId,
        costClass: row.costClass,
        basis: row.basis,
        effectiveOn: row.effectiveOn,
        currency: row.currency,
        amountMinor: row.amountMinor,
        baseAmountMinor: row.baseAmountMinor,
        ledgerAccountCode: row.ledgerAccountCode,
        drilldown: {
          sourceType: "purchase_invoice_allocation",
          sourceId: row.sourceId,
          sourceLineId: row.sourceLineId,
          sourceAllocationId: row.sourceAllocationId,
          journalId: row.journalId,
          evidenceIds: [],
          sourceHref: `/documents/${encodeURIComponent(row.sourceId)}`,
          ...(row.journalId
            ? { journalHref: `/journals/${encodeURIComponent(row.journalId)}` }
            : {}),
          evidenceHrefs: [],
        },
      })),
    };
  }
  async getCost(org: string, id: string) {
    return (
      await this.pool.query(this.costSql() + " where c.organization_id=$1 and c.id=$2", [org, id])
    ).rows[0];
  }
  async unallocated(org: string) {
    const r = await this.pool.query(
      this.costSql() +
        ` where c.organization_id=$1 and c.project_id is null and c.cost_class='direct' and c.base_amount_minor>coalesce((select sum(a.allocatable_amount_minor) from direct_cost_allocations a where a.organization_id=c.organization_id and a.source_cost_item_id=c.id and a.state in('approved','posted')),0) order by c.created_at,c.id`,
      [org],
    );
    return {
      items: r.rows.map((x) => ({
        ...x,
        remainingAmountMinor: (
          BigInt(x.baseAmountMinor) - BigInt(x.allocatedAmountMinor)
        ).toString(),
      })),
    };
  }
  async listAllocations(org: string) {
    const r = await this.pool.query(
      `select id,source_cost_item_id "sourceId",allocatable_amount_minor::text "allocatableAmountMinor",allocatable_base_amount_minor::text "allocatableBaseAmountMinor",state,journal_id "journalId",reversal_journal_id "reversalJournalId",version::text "resourceVersion" from direct_cost_allocations where organization_id=$1 order by created_at desc,id`,
      [org],
    );
    return { items: r.rows };
  }
  async getAllocation(org: string, id: string) {
    const h = await this.pool.query(
      `select id,source_cost_item_id "sourceId",allocatable_amount_minor::text "allocatableAmountMinor",allocatable_base_amount_minor::text "allocatableBaseAmountMinor",state,journal_id "journalId",reversal_journal_id "reversalJournalId",version::text "resourceVersion" from direct_cost_allocations where organization_id=$1 and id=$2`,
      [org, id],
    );
    if (!h.rows[0]) return;
    const s = await this.pool.query(
      `select line_number::text id,project_id "projectId",amount_minor::text "amountMinor",base_amount_minor::text "baseAmountMinor" from direct_cost_allocation_splits where organization_id=$1 and allocation_id=$2 order by line_number`,
      [org, id],
    );
    return { ...h.rows[0], splits: s.rows };
  }
  async createAllocation(c: ProjectCostContext, i: Record<string, unknown>, key: string) {
    return this.mutate(c, key, "direct-cost:create", i, async (q) => {
      const source = await q.query<{ amount: string; base: string; cost_class: string }>(
        `select amount_minor::text amount,base_amount_minor::text base,cost_class from project_cost_items where organization_id=$1 and id=$2 for update`,
        [c.organizationId, i.sourceId],
      );
      if (!source.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      if (source.rows[0].cost_class === "overhead_reserved")
        throw new Error("PROJECT_COST_OVERHEAD_RESERVED");
      let total = 0n,
        baseTotal = 0n;
      for (const x of i.splits as Record<string, unknown>[]) {
        const p = await q.query<{ state: string }>(
          `select state from projects where organization_id=$1 and id=$2`,
          [c.organizationId, x.projectId],
        );
        if (!p.rows[0] || !["planned", "active", "on_hold"].includes(p.rows[0].state))
          throw new Error("PROJECT_COST_PROJECT_INVALID");
        if (!/^\d+$/.test(String(x.amountMinor)) || !/^\d+$/.test(String(x.baseAmountMinor)))
          throw new Error("VALIDATION_FAILED");
        total += BigInt(String(x.amountMinor));
        baseTotal += BigInt(String(x.baseAmountMinor));
      }
      const allocated = await q.query<{ n: string; b: string }>(
        `select coalesce(sum(allocatable_amount_minor),0)::text n,coalesce(sum(allocatable_base_amount_minor),0)::text b from direct_cost_allocations where organization_id=$1 and source_cost_item_id=$2 and state in('approved','posted')`,
        [c.organizationId, i.sourceId],
      );
      if (
        total <= 0n ||
        baseTotal <= 0n ||
        total + BigInt(allocated.rows[0]?.n ?? 0) > BigInt(source.rows[0].amount) ||
        baseTotal + BigInt(allocated.rows[0]?.b ?? 0) > BigInt(source.rows[0].base)
      )
        throw new Error("PROJECT_COST_CAPACITY_EXCEEDED");
      const id = String(i.id ?? randomUUID());
      await q.query(
        `insert into direct_cost_allocations(organization_id,id,source_cost_item_id,allocatable_amount_minor,allocatable_base_amount_minor,created_by)values($1,$2,$3,$4,$5,$6)`,
        [c.organizationId, id, i.sourceId, total.toString(), baseTotal.toString(), c.actorId],
      );
      let n = 0;
      for (const x of i.splits as Record<string, unknown>[])
        await q.query(
          `insert into direct_cost_allocation_splits(organization_id,allocation_id,line_number,project_id,amount_minor,base_amount_minor,reason)values($1,$2,$3,$4,$5,$6,$7)`,
          [c.organizationId, id, ++n, x.projectId, x.amountMinor, x.baseAmountMinor, i.reason],
        );
      await this.audit(q, c, id, "create", "1", String(i.reason));
      return { resource: await this.getWith(q, c.organizationId, id), mutation: this.meta(c, "1") };
    });
  }
  async transition(
    c: ProjectCostContext,
    id: string,
    a: string,
    i: Record<string, unknown>,
    key: string,
  ) {
    return this.mutate(c, key, `direct-cost:${a}`, { id, i }, async (q) => {
      const r = await q.query<{
        state: string;
        version: string;
        allocatable: string;
        base: string;
      }>(
        `select state,version::text,allocatable_amount_minor::text allocatable,allocatable_base_amount_minor::text base from direct_cost_allocations where organization_id=$1 and id=$2 for update`,
        [c.organizationId, id],
      );
      if (!r.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      if (r.rows[0].version !== i.expectedResourceVersion) throw new Error("VERSION_CONFLICT");
      const allowed: Record<string, string[]> = {
        submit: ["draft"],
        approve: ["submitted"],
        post: ["approved"],
        reverse: ["posted"],
      };
      if (!allowed[a]?.includes(r.rows[0].state)) throw new Error("INVALID_STATE_TRANSITION");
      const sum = await q.query<{ n: string; b: string }>(
        `select coalesce(sum(amount_minor),0)::text n,coalesce(sum(base_amount_minor),0)::text b from direct_cost_allocation_splits where organization_id=$1 and allocation_id=$2`,
        [c.organizationId, id],
      );
      if (sum.rows[0]?.n !== r.rows[0].allocatable || sum.rows[0]?.b !== r.rows[0].base)
        throw new Error("PROJECT_COST_SPLIT_TOTAL_MISMATCH");
      let journalId: string | null = null;
      if (a === "post") journalId = await this.postJournal(q, c, id, String(i.reason));
      if (a === "reverse") journalId = await this.reverseJournal(q, c, id, String(i.reason));
      const state =
          a === "submit"
            ? "submitted"
            : a === "approve"
              ? "approved"
              : a === "post"
                ? "posted"
                : "reversed",
        v = (BigInt(r.rows[0].version) + 1n).toString(),
        field =
          a === "submit"
            ? "submitted"
            : a === "approve"
              ? "approved"
              : a === "post"
                ? "posted"
                : "reversed";
      await q.query(
        `update direct_cost_allocations set state=$3::direct_cost_allocation_state,version=$4,${field}_by=$5,${field}_at=now(),reversal_reason=case when $3::direct_cost_allocation_state='reversed'::direct_cost_allocation_state then $6 else reversal_reason end,journal_id=case when $3::direct_cost_allocation_state='posted'::direct_cost_allocation_state then $7 else journal_id end,reversal_journal_id=case when $3::direct_cost_allocation_state='reversed'::direct_cost_allocation_state then $7 else reversal_journal_id end,updated_at=now() where organization_id=$1 and id=$2`,
        [c.organizationId, id, state, v, c.actorId, i.reason, journalId],
      );
      await this.audit(q, c, id, a, v, String(i.reason));
      return { resource: await this.getWith(q, c.organizationId, id), mutation: this.meta(c, v) };
    });
  }
  private costSql() {
    return `select c.id,c.source_type "sourceType",c.source_id "sourceId",c.source_line_id "sourceLineId",c.project_id "projectId",c.cost_class "costClass",c.basis,c.effective_on::text "effectiveOn",c.ledger_account_code "ledgerAccountCode",c.amount_minor::text "amountMinor",c.base_amount_minor::text "baseAmountMinor",c.currency,c.journal_id "journalId",c.evidence_id "evidenceId",c.description,coalesce((select sum(a.allocatable_amount_minor) from direct_cost_allocations a where a.organization_id=c.organization_id and a.source_cost_item_id=c.id and a.state in('approved','posted')),0)::text "allocatedAmountMinor" from project_cost_items c`;
  }
  private async getWith(q: PoolClient, org: string, id: string) {
    const h = await q.query(
        `select id,source_cost_item_id "sourceId",allocatable_amount_minor::text "allocatableAmountMinor",allocatable_base_amount_minor::text "allocatableBaseAmountMinor",state,journal_id "journalId",reversal_journal_id "reversalJournalId",version::text "resourceVersion" from direct_cost_allocations where organization_id=$1 and id=$2`,
        [org, id],
      ),
      s = await q.query(
        `select line_number::text id,project_id "projectId",amount_minor::text "amountMinor",base_amount_minor::text "baseAmountMinor" from direct_cost_allocation_splits where organization_id=$1 and allocation_id=$2 order by line_number`,
        [org, id],
      );
    return { ...h.rows[0], splits: s.rows };
  }
  private meta(c: ProjectCostContext, v: string) {
    return { resourceVersion: v, correlationId: c.correlationId, idempotencyReplayed: false };
  }
  private async postJournal(q: PoolClient, c: ProjectCostContext, id: string, reason: string) {
    const source = await q.query<{ effective: string; account: string; currency: string }>(
      `select p.effective_on::text effective,p.ledger_account_code account,o.base_currency currency from direct_cost_allocations a join project_cost_items p on p.organization_id=a.organization_id and p.id=a.source_cost_item_id join organizations o on o.id=a.organization_id where a.organization_id=$1 and a.id=$2`,
      [c.organizationId, id],
    );
    const s = source.rows[0];
    if (!s) throw new Error("RESOURCE_NOT_FOUND");
    const period = await q.query(
      `select 1 from fiscal_periods where organization_id=$1 and $2::date between starts_on and ends_on and state='open'`,
      [c.organizationId, s.effective],
    );
    if (!period.rows[0]) throw new Error("PROJECT_COST_PERIOD_CLOSED");
    const account = await q.query(
      `select 1 from accounts where organization_id=$1 and code=$2 and root_type='expense'`,
      [c.organizationId, s.account],
    );
    if (!account.rows[0]) throw new Error("PROJECT_COST_ACCOUNT_INVALID");
    const jid = randomUUID();
    await q.query(
      `insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by)values($1,$2,$3,$4,$5,'posted',2,$6,now(),$6,$7,now(),$6)`,
      [
        c.organizationId,
        jid,
        s.effective,
        `Project cost allocation ${id}`,
        s.currency,
        c.actorId,
        reason,
      ],
    );
    const splits = await q.query<{ projectId: string; base: string }>(
      `select project_id "projectId",base_amount_minor::text base from direct_cost_allocation_splits where organization_id=$1 and allocation_id=$2 order by line_number`,
      [c.organizationId, id],
    );
    let line = 0,
      total = 0n;
    for (const x of splits.rows) {
      total += BigInt(x.base);
      await q.query(
        `insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,description,dimensions)values($1,$2,$3,$4,$5,$6,$7)`,
        [c.organizationId, jid, ++line, s.account, x.base, reason, { projectId: x.projectId }],
      );
    }
    await q.query(
      `insert into journal_lines(organization_id,journal_id,line_number,account_code,credit_minor,description,dimensions)values($1,$2,$3,$4,$5,$6,'{}')`,
      [c.organizationId, jid, ++line, s.account, total.toString(), reason],
    );
    return jid;
  }
  private async reverseJournal(q: PoolClient, c: ProjectCostContext, id: string, reason: string) {
    const a = await q.query<{ journal: string }>(
      `select journal_id journal from direct_cost_allocations where organization_id=$1 and id=$2`,
      [c.organizationId, id],
    );
    if (!a.rows[0]?.journal) throw new Error("PROJECT_COST_JOURNAL_MISSING");
    const original = await q.query<{ date: string; currency: string }>(
      `select journal_date::text date,currency from journal_entries where organization_id=$1 and id=$2 for update`,
      [c.organizationId, a.rows[0].journal],
    );
    const o = original.rows[0];
    if (!o) throw new Error("PROJECT_COST_JOURNAL_MISSING");
    const period = await q.query(
      `select 1 from fiscal_periods where organization_id=$1 and $2::date between starts_on and ends_on and state='open'`,
      [c.organizationId, o.date],
    );
    if (!period.rows[0]) throw new Error("PROJECT_COST_PERIOD_CLOSED");
    const jid = randomUUID();
    await q.query(
      `insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by,reversal_of_id)values($1,$2,$3,$4,$5,'posted',2,$6,now(),$6,$7,now(),$6,$8)`,
      [
        c.organizationId,
        jid,
        o.date,
        `Reverse project cost allocation ${id}`,
        o.currency,
        c.actorId,
        reason,
        a.rows[0].journal,
      ],
    );
    await q.query(
      `insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)select organization_id,$3,line_number,account_code,credit_minor,debit_minor,$4,dimensions from journal_lines where organization_id=$1 and journal_id=$2`,
      [c.organizationId, a.rows[0].journal, jid, reason],
    );
    await q.query(
      `update journal_entries set state='reversed',updated_at=now() where organization_id=$1 and id=$2`,
      [c.organizationId, a.rows[0].journal],
    );
    return jid;
  }
  private audit(
    q: PoolClient,
    c: ProjectCostContext,
    id: string,
    action: string,
    version: string,
    reason: string,
  ) {
    return q.query(
      `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state)values($1,$2,'direct_cost_allocation',$3,$4,$5,$6,$7,$8)`,
      [c.organizationId, randomUUID(), id, version, action, c.actorId, c.correlationId, { reason }],
    );
  }
  private async mutate(
    c: ProjectCostContext,
    key: string,
    op: string,
    req: unknown,
    fn: (q: PoolClient) => Promise<Record<string, unknown>>,
  ) {
    const q = await this.pool.connect(),
      h = hash(req);
    try {
      await q.query("begin");
      await q.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${c.organizationId}:${key}`,
      ]);
      const old = await q.query<{ request_hash: string; response_body: Record<string, unknown> }>(
        `select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2 for update`,
        [c.organizationId, key],
      );
      if (old.rows[0]) {
        if (old.rows[0].request_hash !== h) throw new Error("IDEMPOTENCY_CONFLICT");
        await q.query("rollback");
        return { ...old.rows[0].response_body, idempotencyReplayed: true };
      }
      const out = await fn(q);
      await q.query(
        `insert into api_idempotency_records(organization_id,idempotency_key,operation,request_hash,response_body)values($1,$2,$3,$4,$5)`,
        [c.organizationId, key, op, h, out],
      );
      await q.query("commit");
      return out;
    } catch (e) {
      await q.query("rollback");
      throw e;
    } finally {
      q.release();
    }
  }
}
