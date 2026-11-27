import { randomUUID } from "node:crypto";
import { type PoolClient } from "pg";
import type { ProjectRecognitionContext } from "./project-recognition.types.js";
import {
  type IdempotencyRow,
  type RecognitionRow,
  digest,
} from "./pg-project-recognition.store.shared.js";
import type { PgProjectRecognitionStore } from "./pg-project-recognition.store.js";

export async function reverseRecognitionOperation(
  this: PgProjectRecognitionStore,
  q: PoolClient,
  c: ProjectRecognitionContext,
  id: string,
  reason: string,
) {
  const e = await q.query<RecognitionRow>(
    `select * from revenue_recognition_events where organization_id=$1 and id=$2`,
    [c.organizationId, id],
  );
  const x = e.rows[0];
  if (!x) throw new Error("RESOURCE_NOT_FOUND");
  if (!x.journal_id) throw new Error("RECOGNITION_JOURNAL_MISSING");
  await this.openPeriod(q, c.organizationId, x.effective_on);
  const jid = randomUUID();
  await q.query(
    `insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by,reversal_of_id)values($1,$2,$3,$4,$5,'posted',2,$6,now(),$6,$7,now(),$6,$8)`,
    [
      c.organizationId,
      jid,
      x.effective_on,
      `Reverse revenue recognition ${id}`,
      x.currency,
      c.actorId,
      reason,
      x.journal_id,
    ],
  );
  await q.query(
    `insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)select organization_id,$3,line_number,account_code,credit_minor,debit_minor,$4,dimensions from journal_lines where organization_id=$1 and journal_id=$2`,
    [c.organizationId, x.journal_id, jid, reason],
  );
  await q.query(
    `update journal_entries set state='reversed',updated_at=now() where organization_id=$1 and id=$2`,
    [c.organizationId, x.journal_id],
  );
  return jid;
}

export async function mutateOperation(
  this: PgProjectRecognitionStore,
  c: ProjectRecognitionContext,
  key: string,
  operation: string,
  request: unknown,
  fn: (q: PoolClient) => Promise<Record<string, unknown>>,
) {
  const q = await this.pool.connect(),
    h = digest(request);
  try {
    await q.query("begin");
    await q.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${c.organizationId}:${key}`,
    ]);
    const old = await q.query<IdempotencyRow>(
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
      [c.organizationId, key, operation, h, out],
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
