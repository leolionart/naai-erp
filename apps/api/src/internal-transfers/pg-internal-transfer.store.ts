import type { RawListQuery } from "@naai-erp/contracts";
import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg, { type PoolClient } from "pg";
import {
  countRows,
  cursorParams,
  keysetSql,
  parseDatedList,
  toListResponse,
} from "../common/dated-list.js";
import type {
  CreateInternalTransferInput,
  InternalTransferContext,
  InternalTransferStore,
} from "./internal-transfer.types.js";
import { type Tx, digest } from "./pg-internal-transfer.store.shared.js";
import {
  transactionCandidatesOperation,
  createOperation,
} from "./internal-transfer-transaction-candidates.operation.js";
import { matchOperation, unmatchOperation } from "./internal-transfer-match.operation.js";
import { viewOperation } from "./internal-transfer-view.operation.js";

@Injectable()
export class PgInternalTransferStore implements InternalTransferStore {
  readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  /** Keyset page ordered by created_at, id; only page rows are expanded with `view` (BR-READ-002). */
  async list(
    org: string,
    f: { state?: string; financialAccountId?: string },
    paging: RawListQuery = {},
  ) {
    const { query, ascending, search } = parseDatedList(paging);
    const fromWhere = `internal_transfers t
      join internal_transfer_attempts a on a.organization_id=t.organization_id
        and a.transfer_id=t.id and a.attempt_number=t.current_attempt_number`;
    const filterSql = `where t.organization_id=$1
      and ($2::text is null or t.state::text=$2)
      and ($3::text is null or exists(
        select 1 from bank_transactions b
        where b.organization_id=t.organization_id
          and b.id in (a.outgoing_transaction_id, a.incoming_transaction_id)
          and b.financial_account_id=$3
      ))
      and ($4::text is null or t.id ilike $4 or t.transit_account_code ilike $4 or exists(
        select 1 from bank_transactions b
        where b.organization_id=t.organization_id
          and b.id in (a.outgoing_transaction_id, a.incoming_transaction_id)
          and (b.description ilike $4 or b.reference ilike $4)
      ))`;
    const params = [org, f.state ?? null, f.financialAccountId ?? null, search];
    const keyset = keysetSql("t.created_at", "t.id", ascending, 5, 6, "timestamptz");
    const r = await this.pool.query<{ id: string; created_at_key: string }>(
      `select t.id, t.created_at::text created_at_key
       from ${fromWhere}
       ${filterSql} and ${keyset.where}
       order by ${keyset.orderBy}
       limit $7`,
      [...params, ...cursorParams(query.cursor), query.limit + 1],
    );
    const total = query.includeTotal
      ? await countRows(this.pool, fromWhere, filterSql, params)
      : undefined;
    const page = toListResponse(r.rows, query, (row) => row.created_at_key, {
      ...(total === undefined ? {} : { total }),
    });
    const items = await Promise.all(
      (page.items as { id: string }[]).map((x) => this.view(this.pool, org, x.id)),
    );
    return { data: { ...page.data, items }, meta: page.meta };
  }
  async get(org: string, id: string) {
    const r = await this.pool.query(
      "select 1 from internal_transfers where organization_id=$1 and id=$2",
      [org, id],
    );
    return r.rows[0] ? this.view(this.pool, org, id) : undefined;
  }
  transactionCandidates = transactionCandidatesOperation;
  create = createOperation;
  match = matchOperation;
  unmatch = unmatchOperation;
  async lockTx(c: PoolClient, org: string, id: string) {
    await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`${org}:bank:${id}`]);
    const r = await c.query<Tx>(
      `select b.id,b.state,b.amount_minor::text,b.currency,b.booking_date::text,b.reference,b.description,b.financial_account_id,f.ledger_account_code from bank_transactions b join financial_accounts f on f.organization_id=b.organization_id and f.id=b.financial_account_id where b.organization_id=$1 and b.id=$2 for update of b`,
      [org, id],
    );
    if (!r.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    return r.rows[0];
  }
  available(tx: Tx) {
    if (!["imported", "suggested", "needs_review"].includes(tx.state))
      throw new Error("INTERNAL_TRANSFER_TRANSACTION_UNAVAILABLE");
  }
  async validateTransit(c: PoolClient, org: string, code: string, bankCode: string) {
    const r = await c.query<{ root_type: string }>(
      "select root_type from accounts where organization_id=$1 and code=$2",
      [org, code],
    );
    if (r.rows[0]?.root_type !== "asset" || code === bankCode)
      throw new Error("INTERNAL_TRANSFER_TRANSIT_ACCOUNT_INVALID");
  }
  async postLeg(
    c: PoolClient,
    context: InternalTransferContext,
    tx: Tx,
    transit: string,
    transferId: string,
    fee?: NonNullable<CreateInternalTransferInput["fee"]>,
  ) {
    await this.period(c, context, tx.booking_date);
    const id = randomUUID(),
      out = BigInt(tx.amount_minor) < 0n,
      amount = out ? -BigInt(tx.amount_minor) : BigInt(tx.amount_minor);
    if (fee) {
      const account = await c.query<{ root_type: string }>(
        "select root_type from accounts where organization_id=$1 and code=$2",
        [context.organizationId, fee.expenseAccountId],
      );
      if (account.rows[0]?.root_type !== "expense")
        throw new Error("INTERNAL_TRANSFER_FEE_ACCOUNT_INVALID");
    }
    await c.query(
      `insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by)values($1,$2,$3,$4,$5,'posted',2,$6,now(),$6,'Internal transfer',now(),$6)`,
      [
        context.organizationId,
        id,
        tx.booking_date,
        `Internal transfer ${transferId}`,
        tx.currency,
        context.actorId,
      ],
    );
    const feeAmount = fee ? BigInt(fee.baseAmountMinor) : 0n,
      principal = out ? amount - feeAmount : amount;
    const lines = out
      ? [
          { a: transit, d: principal },
          ...(feeAmount > 0n ? [{ a: fee!.expenseAccountId, d: feeAmount }] : []),
          { a: tx.ledger_account_code, c: amount },
        ]
      : [
          { a: tx.ledger_account_code, d: amount },
          { a: transit, c: amount },
        ];
    for (const [x, l] of lines.entries())
      await c.query(
        "insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)values($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          context.organizationId,
          id,
          x + 1,
          l.a,
          l.d?.toString() ?? null,
          l.c?.toString() ?? null,
          `Transfer leg ${tx.id}`,
          {
            internalTransferId: transferId,
            bankTransactionId: tx.id,
            sourceKind: "internal_transfer",
          },
        ],
      );
    return id;
  }
  async postFee(
    c: PoolClient,
    context: InternalTransferContext,
    tx: Tx,
    expenseAccount: string,
    reason: string,
    transferId: string,
  ) {
    await this.period(c, context, tx.booking_date);
    const amount =
      BigInt(tx.amount_minor) < 0n ? -BigInt(tx.amount_minor) : BigInt(tx.amount_minor);
    if (BigInt(tx.amount_minor) >= 0n) throw new Error("INTERNAL_TRANSFER_FEE_MISMATCH");
    const account = await c.query<{ root_type: string }>(
      "select root_type from accounts where organization_id=$1 and code=$2",
      [context.organizationId, expenseAccount],
    );
    if (account.rows[0]?.root_type !== "expense")
      throw new Error("INTERNAL_TRANSFER_FEE_ACCOUNT_INVALID");
    const id = randomUUID();
    await c.query(
      `insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by)values($1,$2,$3,$4,$5,'posted',2,$6,now(),$6,$7,now(),$6)`,
      [
        context.organizationId,
        id,
        tx.booking_date,
        `Transfer fee ${transferId}`,
        tx.currency,
        context.actorId,
        reason,
      ],
    );
    for (const [x, l] of [
      { a: expenseAccount, d: amount },
      { a: tx.ledger_account_code, c: amount },
    ].entries())
      await c.query(
        "insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)values($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          context.organizationId,
          id,
          x + 1,
          l.a,
          l.d?.toString() ?? null,
          l.c?.toString() ?? null,
          reason,
          { internalTransferId: transferId, bankTransactionId: tx.id, sourceKind: "transfer_fee" },
        ],
      );
    return id;
  }
  async postDirect(
    c: PoolClient,
    context: InternalTransferContext,
    source: Tx,
    destination: Tx,
    principalInput: string,
    transferId: string,
    fee?: NonNullable<CreateInternalTransferInput["fee"]>,
  ) {
    await this.period(c, context, source.booking_date);
    if (destination.booking_date !== source.booking_date)
      throw new Error("INTERNAL_TRANSFER_DIRECT_DATE_MISMATCH");
    const principal = BigInt(principalInput),
      feeAmount = fee ? BigInt(fee.baseAmountMinor) : 0n;
    if (fee) {
      const account = await c.query<{ root_type: string }>(
        "select root_type from accounts where organization_id=$1 and code=$2",
        [context.organizationId, fee.expenseAccountId],
      );
      if (account.rows[0]?.root_type !== "expense")
        throw new Error("INTERNAL_TRANSFER_FEE_ACCOUNT_INVALID");
    }
    const id = randomUUID();
    await c.query(
      `insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by)values($1,$2,$3,$4,$5,'posted',2,$6,now(),$6,'Internal transfer direct',now(),$6)`,
      [
        context.organizationId,
        id,
        source.booking_date,
        `Internal transfer ${transferId}`,
        source.currency,
        context.actorId,
      ],
    );
    const lines = [
      { a: destination.ledger_account_code, d: principal },
      ...(feeAmount > 0n ? [{ a: fee!.expenseAccountId, d: feeAmount }] : []),
      { a: source.ledger_account_code, c: principal + feeAmount },
    ];
    for (const [x, l] of lines.entries())
      await c.query(
        "insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)values($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          context.organizationId,
          id,
          x + 1,
          l.a,
          l.d?.toString() ?? null,
          l.c?.toString() ?? null,
          `Direct transfer ${transferId}`,
          { internalTransferId: transferId, sourceKind: "internal_transfer_direct" },
        ],
      );
    return id;
  }
  async reverse(
    c: PoolClient,
    context: InternalTransferContext,
    journalId: string,
    reason: string,
  ) {
    const j = await c.query<{ journal_date: string; currency: string }>(
      "select journal_date::text,currency from journal_entries where organization_id=$1 and id=$2 and state='posted'for update",
      [context.organizationId, journalId],
    );
    if (!j.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    await this.period(c, context, j.rows[0].journal_date);
    const lines = await c.query<{
      account_code: string;
      debit_minor: string | null;
      credit_minor: string | null;
      description: string | null;
      dimensions: Record<string, string>;
    }>(
      "select account_code,debit_minor::text,credit_minor::text,description,dimensions from journal_lines where organization_id=$1 and journal_id=$2 order by line_number",
      [context.organizationId, journalId],
    );
    const id = randomUUID();
    await c.query(
      `insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by,reversal_of_id)values($1,$2,$3,$4,$5,'posted',2,$6,now(),$6,$7,now(),$6,$8)`,
      [
        context.organizationId,
        id,
        j.rows[0].journal_date,
        `Reverse ${journalId}`,
        j.rows[0].currency,
        context.actorId,
        reason,
        journalId,
      ],
    );
    for (const [x, l] of lines.rows.entries())
      await c.query(
        "insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)values($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          context.organizationId,
          id,
          x + 1,
          l.account_code,
          l.credit_minor,
          l.debit_minor,
          l.description,
          { ...l.dimensions, reversalOfJournalId: journalId },
        ],
      );
    await c.query(
      "update journal_entries set state='reversed',version=version+1,updated_at=now()where organization_id=$1 and id=$2",
      [context.organizationId, journalId],
    );
    return id;
  }
  async period(c: PoolClient, context: InternalTransferContext, date: string) {
    const r = await c.query<{ state: string }>(
      "select state from fiscal_periods where organization_id=$1 and $2::date between starts_on and ends_on",
      [context.organizationId, date],
    );
    if (r.rows.length !== 1)
      throw new Error(r.rows.length ? "FISCAL_PERIOD_AMBIGUOUS" : "FISCAL_PERIOD_NOT_FOUND");
    if (r.rows[0]!.state === "hard_locked") throw new Error("PERIOD_HARD_LOCKED");
    if (
      r.rows[0]!.state === "soft_locked" &&
      !context.roles.some((x) => ["owner", "finance_admin"].includes(x))
    )
      throw new Error("PERIOD_SOFT_LOCKED");
  }
  amountScore(a: Tx, b: Tx) {
    const aa = BigInt(a.amount_minor) < 0n ? -BigInt(a.amount_minor) : BigInt(a.amount_minor),
      bb = BigInt(b.amount_minor) < 0n ? -BigInt(b.amount_minor) : BigInt(b.amount_minor);
    return Number((6000n * (aa < bb ? aa : bb)) / (aa > bb ? aa : bb));
  }
  score(a: Tx, b: Tx) {
    const days = Math.abs((Date.parse(a.booking_date) - Date.parse(b.booking_date)) / 86400000);
    const ref =
      a.reference &&
      b.reference &&
      a.reference.trim().toUpperCase() === b.reference.trim().toUpperCase()
        ? 1000
        : 0;
    return this.amountScore(a, b) + 1000 + 1000 + Math.max(0, 1000 - Math.round(days) * 100) + ref;
  }
  view = viewOperation;
  async mutate(
    context: InternalTransferContext,
    key: string,
    op: string,
    req: unknown,
    fn: (c: PoolClient) => Promise<Record<string, unknown>>,
  ) {
    const h = digest(req),
      c = await this.pool.connect();
    try {
      await c.query("begin");
      await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${context.organizationId}:${key}`,
      ]);
      const old = await c.query<{ request_hash: string; response_body: Record<string, unknown> }>(
        "select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2 for update",
        [context.organizationId, key],
      );
      if (old.rows[0]) {
        if (old.rows[0].request_hash !== h) throw new Error("IDEMPOTENCY_CONFLICT");
        await c.query("rollback");
        const b = old.rows[0].response_body;
        return b.mutation && typeof b.mutation === "object"
          ? {
              ...b,
              mutation: { ...(b.mutation as Record<string, unknown>), idempotencyReplayed: true },
            }
          : { ...b, idempotencyReplayed: true };
      }
      const response = await fn(c);
      await c.query(
        "insert into api_idempotency_records(organization_id,idempotency_key,operation,request_hash,response_body)values($1,$2,$3,$4,$5)",
        [context.organizationId, key, op, h, response],
      );
      await c.query("commit");
      return response;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  }
  async event(
    c: PoolClient,
    x: InternalTransferContext,
    t: string,
    n: number,
    a: string,
    r: string,
    d: unknown,
  ) {
    const id = randomUUID();
    await c.query(
      "insert into internal_transfer_events(organization_id,id,transfer_id,attempt_number,action,actor_id,reason,correlation_id,details)values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [x.organizationId, id, t, n, a, x.actorId, r, x.correlationId, d],
    );
    return id;
  }
  audit(
    c: PoolClient,
    x: InternalTransferContext,
    id: string,
    key: string,
    a: string,
    v: bigint,
    b: unknown,
    z: unknown,
  ) {
    return c.query(
      "insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)values($1,$2,'internal_transfer',$3,$4,$5,$6,$7,$8,$9)",
      [x.organizationId, id, key, v.toString(), a, x.actorId, x.correlationId, b, z],
    );
  }
  outbox(
    c: PoolClient,
    x: InternalTransferContext,
    id: string,
    key: string,
    e: string,
    p: unknown,
  ) {
    return c.query(
      "insert into outbox_events(organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)values($1,$2,'internal_transfer',$3,$4,1,$5,$6)",
      [x.organizationId, id, key, e, p, x.correlationId],
    );
  }
}
