import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg from "pg";
import {
  canSelfApprove,
  resolveOrganizationWorkflowPolicy,
} from "../workflow-policy/organization-workflow-policy.service.js";
import type { CreateJournalInput, JournalActorContext } from "./journal.types.js";

@Injectable()
export class PgJournalStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  async list(organizationId: string) {
    const result = await this.pool.query(
      `select j.*, coalesce(json_agg(l order by l.line_number) filter (where l.line_number is not null), '[]') as lines
       from journal_entries j left join journal_lines l
         on l.organization_id=j.organization_id and l.journal_id=j.id
       where j.organization_id=$1 group by j.organization_id,j.id order by j.journal_date desc,j.id`,
      [organizationId],
    );
    return result.rows;
  }

  async get(organizationId: string, journalId: string) {
    const result = await this.pool.query(
      `select j.*, coalesce(json_agg(l order by l.line_number) filter (where l.line_number is not null), '[]') as lines
       from journal_entries j left join journal_lines l
         on l.organization_id=j.organization_id and l.journal_id=j.id
       where j.organization_id=$1 and j.id=$2 group by j.organization_id,j.id`,
      [organizationId, journalId],
    );
    return result.rows[0];
  }

  async create(context: JournalActorContext, input: CreateJournalInput, idempotencyKey: string) {
    const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `${context.organizationId}:${idempotencyKey}`,
      ]);
      const replay = await client.query<{
        request_hash: string;
        response_body: Record<string, unknown>;
      }>(
        "select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2 for update",
        [context.organizationId, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
        await client.query("rollback");
        return { ...replay.rows[0].response_body, idempotencyReplayed: true };
      }
      const journalId = input.id ?? randomUUID();
      await client.query(
        `insert into journal_entries (organization_id,id,journal_date,description,currency,state,created_by)
         values ($1,$2,$3,$4,$5,'draft',$6)`,
        [
          context.organizationId,
          journalId,
          input.journalDate,
          input.description,
          input.currency,
          context.actorId,
        ],
      );
      for (const [index, line] of input.lines.entries()) {
        await client.query(
          `insert into journal_lines
           (organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            context.organizationId,
            journalId,
            index + 1,
            line.accountCode,
            line.debitMinor ?? null,
            line.creditMinor ?? null,
            line.description ?? null,
            line.dimensions ?? {},
          ],
        );
      }
      const auditEventId = randomUUID();
      await client.query(
        `insert into resource_audit_events
         (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state)
         values ($1,$2,'journal',$3,1,'create',$4,$5,$6)`,
        [
          context.organizationId,
          auditEventId,
          journalId,
          context.actorId,
          context.correlationId,
          { state: "draft" },
        ],
      );
      const response = { journalId, resourceVersion: "1", auditEventId, nextActions: ["approve"] };
      await client.query(
        `insert into api_idempotency_records
         (organization_id,idempotency_key,operation,request_hash,response_body)
         values ($1,$2,'journal:create',$3,$4)`,
        [context.organizationId, idempotencyKey, requestHash, response],
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

  async post(context: JournalActorContext, journalId: string, idempotencyKey: string) {
    const requestHash = createHash("sha256").update(JSON.stringify({ journalId })).digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `${context.organizationId}:${idempotencyKey}`,
      ]);
      const replay = await client.query<{
        request_hash: string;
        response_body: Record<string, unknown>;
      }>(
        "select request_hash,response_body from journal_posting_commands where organization_id=$1 and idempotency_key=$2 for update",
        [context.organizationId, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
        await client.query("rollback");
        return { ...replay.rows[0].response_body, idempotencyReplayed: true };
      }
      const journal = await client.query<{ state: string; version: string; journal_date: string }>(
        "select state,version,journal_date::text from journal_entries where organization_id=$1 and id=$2 for update",
        [context.organizationId, journalId],
      );
      if (!journal.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      if (journal.rows[0].state === "posted") throw new Error("JOURNAL_ALREADY_POSTED");
      if (journal.rows[0].state !== "approved") throw new Error("JOURNAL_NOT_APPROVED");
      await this.assertPostingPeriodAllowed(client, context, journal.rows[0].journal_date);
      const totals = await client.query<{ debit: string; credit: string; count: string }>(
        `select coalesce(sum(debit_minor),0)::text debit,coalesce(sum(credit_minor),0)::text credit,count(*)::text count
         from journal_lines where organization_id=$1 and journal_id=$2`,
        [context.organizationId, journalId],
      );
      const total = totals.rows[0]!;
      if (Number(total.count) < 2 || total.debit !== total.credit)
        throw new Error("JOURNAL_UNBALANCED");
      const updated = await client.query<{ version: string; posted_at: Date }>(
        `update journal_entries set state='posted',posted_at=now(),posted_by=$3,version=version+1,updated_at=now()
         where organization_id=$1 and id=$2 returning version,posted_at`,
        [context.organizationId, journalId, context.actorId],
      );
      const auditEventId = randomUUID();
      const outboxEventId = randomUUID();
      await client.query(
        `insert into resource_audit_events
         (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
         values ($1,$2,'journal',$3,$4,'post',$5,$6,$7,$8)`,
        [
          context.organizationId,
          auditEventId,
          journalId,
          updated.rows[0]!.version,
          context.actorId,
          context.correlationId,
          { state: journal.rows[0].state },
          { state: "posted" },
        ],
      );
      await client.query(
        `insert into outbox_events
         (organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)
         values ($1,$2,'journal',$3,'journal.posted',1,$4,$5)`,
        [context.organizationId, outboxEventId, journalId, { journalId }, context.correlationId],
      );
      const response = {
        journalId,
        state: "posted",
        resourceVersion: updated.rows[0]!.version,
        auditEventId,
        outboxEventId,
        nextActions: ["reverse"],
      };
      await client.query(
        `insert into journal_posting_commands
         (organization_id,idempotency_key,journal_id,request_hash,response_body) values ($1,$2,$3,$4,$5)`,
        [context.organizationId, idempotencyKey, journalId, requestHash, response],
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

  async approve(
    context: JournalActorContext,
    journalId: string,
    input: { reason: string },
    idempotencyKey: string,
  ) {
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ journalId, input }))
      .digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `${context.organizationId}:${idempotencyKey}`,
      ]);
      const replay = await client.query<{
        request_hash: string;
        response_body: Record<string, unknown>;
      }>(
        "select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2 for update",
        [context.organizationId, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
        await client.query("rollback");
        return { ...replay.rows[0].response_body, idempotencyReplayed: true };
      }
      const journal = await client.query<{
        state: string;
        version: string;
        created_by: string | null;
      }>(
        `select state,version,created_by from journal_entries
         where organization_id=$1 and id=$2 for update`,
        [context.organizationId, journalId],
      );
      const current = journal.rows[0];
      if (!current) throw new Error("RESOURCE_NOT_FOUND");
      if (current.state !== "draft") throw new Error("INVALID_JOURNAL_STATE");
      const totals = await client.query<{ total_minor: string }>(
        `select coalesce(sum(debit_minor),0)::text total_minor from journal_lines
         where organization_id=$1 and journal_id=$2`,
        [context.organizationId, journalId],
      );
      const selfApproval = current.created_by === context.actorId;
      if (selfApproval) {
        const policy = await resolveOrganizationWorkflowPolicy(context.organizationId, client);
        if (
          !canSelfApprove({
            policy,
            roles: context.roles,
            amountMinor: BigInt(totals.rows[0]!.total_minor),
          })
        )
          throw new Error("MAKER_CHECKER_VIOLATION");
      }
      const updated = await client.query<{ version: string }>(
        `update journal_entries set state='approved',approved_at=now(),approved_by=$3,
          approval_reason=$4,self_approved=$5,version=version+1,updated_at=now()
         where organization_id=$1 and id=$2 returning version`,
        [context.organizationId, journalId, context.actorId, input.reason, selfApproval],
      );
      const auditEventId = randomUUID();
      const outboxEventId = randomUUID();
      await client.query(
        `insert into resource_audit_events
         (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
         values ($1,$2,'journal',$3,$4,'approve',$5,$6,$7,$8)`,
        [
          context.organizationId,
          auditEventId,
          journalId,
          updated.rows[0]!.version,
          context.actorId,
          context.correlationId,
          { state: "draft" },
          { state: "approved", reason: input.reason, selfApproval },
        ],
      );
      await client.query(
        `insert into outbox_events
         (organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)
         values ($1,$2,'journal',$3,'journal.approved',1,$4,$5)`,
        [context.organizationId, outboxEventId, journalId, { journalId }, context.correlationId],
      );
      const response = {
        journalId,
        state: "approved",
        resourceVersion: updated.rows[0]!.version,
        auditEventId,
        outboxEventId,
        selfApproval,
        nextActions: ["post"],
      };
      await client.query(
        `insert into api_idempotency_records
         (organization_id,idempotency_key,operation,request_hash,response_body)
         values ($1,$2,'journal:approve',$3,$4)`,
        [context.organizationId, idempotencyKey, requestHash, response],
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

  async reverse(
    context: JournalActorContext,
    journalId: string,
    input: { reason: string; reversalDate: string; reversalJournalId?: string },
    idempotencyKey: string,
  ) {
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ journalId, input }))
      .digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `${context.organizationId}:${idempotencyKey}`,
      ]);
      const replay = await client.query<{
        request_hash: string;
        response_body: Record<string, unknown>;
      }>(
        "select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2 for update",
        [context.organizationId, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
        await client.query("rollback");
        return { ...replay.rows[0].response_body, idempotencyReplayed: true };
      }
      const original = await client.query<{
        state: string;
        version: string;
        description: string;
        currency: string;
      }>(
        "select state,version,description,currency from journal_entries where organization_id=$1 and id=$2 for update",
        [context.organizationId, journalId],
      );
      const current = original.rows[0];
      if (!current) throw new Error("RESOURCE_NOT_FOUND");
      if (current.state !== "posted") throw new Error("INVALID_JOURNAL_STATE");
      await this.assertPostingPeriodAllowed(client, context, input.reversalDate);
      const existing = await client.query(
        "select 1 from journal_entries where organization_id=$1 and reversal_of_id=$2",
        [context.organizationId, journalId],
      );
      if (existing.rowCount) throw new Error("JOURNAL_ALREADY_REVERSED");
      const lines = await client.query<{
        line_number: number;
        account_code: string;
        debit_minor: string | null;
        credit_minor: string | null;
        description: string | null;
        dimensions: Record<string, string>;
      }>(
        "select * from journal_lines where organization_id=$1 and journal_id=$2 order by line_number",
        [context.organizationId, journalId],
      );
      const reversalJournalId = input.reversalJournalId ?? randomUUID();
      await client.query(
        `insert into journal_entries
         (organization_id,id,journal_date,description,currency,state,created_by,approved_at,approved_by,
          approval_reason,posted_at,posted_by,reversal_of_id,version)
         values ($1,$2,$3,$4,$5,'posted',$6,now(),$6,$7,now(),$6,$8,3)`,
        [
          context.organizationId,
          reversalJournalId,
          input.reversalDate,
          `Reversal of ${journalId}: ${input.reason}`,
          current.currency,
          context.actorId,
          input.reason,
          journalId,
        ],
      );
      for (const line of lines.rows) {
        await client.query(
          `insert into journal_lines
           (organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            context.organizationId,
            reversalJournalId,
            line.line_number,
            line.account_code,
            line.credit_minor,
            line.debit_minor,
            line.description,
            line.dimensions,
          ],
        );
      }
      await client.query(
        "update journal_entries set state='reversed',version=version+1,updated_at=now() where organization_id=$1 and id=$2",
        [context.organizationId, journalId],
      );
      const auditEventId = randomUUID();
      const outboxEventId = randomUUID();
      await client.query(
        `insert into resource_audit_events
         (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
         values ($1,$2,'journal',$3,$4,'reverse',$5,$6,$7,$8)`,
        [
          context.organizationId,
          auditEventId,
          journalId,
          (BigInt(current.version) + 1n).toString(),
          context.actorId,
          context.correlationId,
          { state: "posted" },
          { state: "reversed", reversalJournalId, reason: input.reason },
        ],
      );
      await client.query(
        `insert into outbox_events
         (organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)
         values ($1,$2,'journal',$3,'journal.reversed',1,$4,$5)`,
        [
          context.organizationId,
          outboxEventId,
          journalId,
          { journalId, reversalJournalId },
          context.correlationId,
        ],
      );
      const response = {
        journalId,
        state: "reversed",
        reversalJournalId,
        auditEventId,
        outboxEventId,
        nextActions: ["repost"],
      };
      await client.query(
        `insert into api_idempotency_records
         (organization_id,idempotency_key,operation,request_hash,response_body)
         values ($1,$2,'journal:reverse',$3,$4)`,
        [context.organizationId, idempotencyKey, requestHash, response],
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

  async repost(
    context: JournalActorContext,
    journalId: string,
    input: CreateJournalInput,
    idempotencyKey: string,
  ) {
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ journalId, input }))
      .digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `${context.organizationId}:${idempotencyKey}`,
      ]);
      const replay = await client.query<{
        request_hash: string;
        response_body: Record<string, unknown>;
      }>(
        "select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2 for update",
        [context.organizationId, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
        await client.query("rollback");
        return { ...replay.rows[0].response_body, idempotencyReplayed: true };
      }
      const original = await client.query<{ state: string }>(
        "select state from journal_entries where organization_id=$1 and id=$2 for update",
        [context.organizationId, journalId],
      );
      if (!original.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      if (original.rows[0].state !== "reversed") throw new Error("INVALID_JOURNAL_STATE");
      const replacementJournalId = input.id ?? randomUUID();
      await client.query(
        `insert into journal_entries
         (organization_id,id,journal_date,description,currency,state,created_by,replacement_of_id)
         values ($1,$2,$3,$4,$5,'draft',$6,$7)`,
        [
          context.organizationId,
          replacementJournalId,
          input.journalDate,
          input.description,
          input.currency,
          context.actorId,
          journalId,
        ],
      );
      for (const [index, line] of input.lines.entries()) {
        await client.query(
          `insert into journal_lines
           (organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            context.organizationId,
            replacementJournalId,
            index + 1,
            line.accountCode,
            line.debitMinor ?? null,
            line.creditMinor ?? null,
            line.description ?? null,
            line.dimensions ?? {},
          ],
        );
      }
      const auditEventId = randomUUID();
      await client.query(
        `insert into resource_audit_events
         (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state)
         values ($1,$2,'journal',$3,1,'repost',$4,$5,$6)`,
        [
          context.organizationId,
          auditEventId,
          replacementJournalId,
          context.actorId,
          context.correlationId,
          { state: "draft", replacementOfJournalId: journalId },
        ],
      );
      const response = {
        journalId: replacementJournalId,
        state: "draft",
        replacementOfJournalId: journalId,
        resourceVersion: "1",
        auditEventId,
        nextActions: ["approve"],
      };
      await client.query(
        `insert into api_idempotency_records
         (organization_id,idempotency_key,operation,request_hash,response_body)
         values ($1,$2,'journal:repost',$3,$4)`,
        [context.organizationId, idempotencyKey, requestHash, response],
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

  private async assertPostingPeriodAllowed(
    client: pg.PoolClient,
    context: JournalActorContext,
    postingDate: string,
  ): Promise<void> {
    const periods = await client.query<{ state: string }>(
      `select state from fiscal_periods
       where organization_id=$1 and $2::date between starts_on and ends_on
       order by fiscal_year,period_number limit 2`,
      [context.organizationId, postingDate],
    );
    if (periods.rows.length === 0) throw new Error("FISCAL_PERIOD_NOT_FOUND");
    if (periods.rows.length > 1) throw new Error("FISCAL_PERIOD_AMBIGUOUS");
    const state = periods.rows[0]!.state;
    if (state === "hard_locked") throw new Error("PERIOD_HARD_LOCKED");
    if (state === "soft_locked") {
      const policy = await client.query<{ soft_lock_posting_roles: string[] }>(
        `select soft_lock_posting_roles from accounting_workflow_policies
         where organization_id=$1`,
        [context.organizationId],
      );
      const roles = policy.rows[0]?.soft_lock_posting_roles ?? ["owner", "finance_admin"];
      if (!context.roles.some((role) => roles.includes(role)))
        throw new Error("PERIOD_SOFT_LOCKED");
    }
  }
}
