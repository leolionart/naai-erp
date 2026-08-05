import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg from "pg";
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
        `insert into journal_entries (organization_id,id,journal_date,description,currency,state)
         values ($1,$2,$3,$4,$5,'draft')`,
        [context.organizationId, journalId, input.journalDate, input.description, input.currency],
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
      const response = { journalId, resourceVersion: "1", auditEventId, nextActions: ["post"] };
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
      const journal = await client.query<{ state: string; version: string }>(
        "select state,version from journal_entries where organization_id=$1 and id=$2 for update",
        [context.organizationId, journalId],
      );
      if (!journal.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      if (journal.rows[0].state === "posted") throw new Error("JOURNAL_ALREADY_POSTED");
      if (journal.rows[0].state !== "draft" && journal.rows[0].state !== "approved")
        throw new Error("INVALID_JOURNAL_STATE");
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
}
