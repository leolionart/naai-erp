import { createHash, randomUUID } from "node:crypto";
import {
  canSelfApprove,
  resolveOrganizationWorkflowPolicy,
} from "../workflow-policy/organization-workflow-policy.service.js";
import type { JournalActorContext } from "./journal.types.js";
import type { PgJournalStore } from "./pg-journal.store.js";

export async function approveOperation(
  this: PgJournalStore,
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

export async function reverseOperation(
  this: PgJournalStore,
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
