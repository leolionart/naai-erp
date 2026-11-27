import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg, { type PoolClient } from "pg";
import type {
  BankingControlContext,
  CloseStatementSessionInput,
  CreateControlExceptionInput,
  CreateStatementSessionInput,
  ReviewControlExceptionInput,
} from "./banking-control.types.js";
import { hash } from "./pg-banking-control.store.shared.js";
import { viewOperation, controlOperation } from "./banking-control-view.operation.js";

@Injectable()
export class PgBankingControlStore {
  readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  async list(org: string) {
    const r = await this.pool.query<{ id: string }>(
      "select id from bank_statement_sessions where organization_id=$1 order by period_end desc,id",
      [org],
    );
    return {
      items: await Promise.all(
        r.rows.map(async ({ id }) => (await this.view(this.pool, org, id)).session),
      ),
    };
  }
  async get(org: string, id: string) {
    const s = await this.pool.query(
      "select * from bank_statement_sessions where organization_id=$1 and id=$2",
      [org, id],
    );
    if (!s.rows[0]) return undefined;
    return this.view(this.pool, org, id);
  }
  async create(c: BankingControlContext, i: CreateStatementSessionInput, key: string) {
    return this.mutate(c, key, "bank-control:create", i, async (q) => {
      const account = await q.query<{ currency: string }>(
        "select currency from financial_accounts where organization_id=$1 and id=$2 and status='active' for update",
        [c.organizationId, i.financialAccountId],
      );
      if (!account.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      if (account.rows[0].currency !== i.currency)
        throw new Error("BANK_CONTROL_CURRENCY_MISMATCH");
      const ids = [...new Set(i.importIds)].sort();
      if (ids.length !== i.importIds.length) throw new Error("BANK_CONTROL_IMPORT_DUPLICATE");
      for (const importId of ids) {
        const imp = await q.query<{ financial_account_id: string }>(
          "select financial_account_id from bank_statement_imports where organization_id=$1 and id=$2 for update",
          [c.organizationId, importId],
        );
        if (!imp.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
        if (imp.rows[0].financial_account_id !== i.financialAccountId)
          throw new Error("BANK_CONTROL_IMPORT_ACCOUNT_MISMATCH");
      }
      const id = i.id ?? randomUUID();
      await q.query(
        "insert into bank_statement_sessions(organization_id,id,financial_account_id,period_start,period_end,opening_balance_minor,closing_balance_minor,currency,created_by,correlation_id)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          c.organizationId,
          id,
          i.financialAccountId,
          i.periodStart,
          i.periodEnd,
          i.openingBalanceMinor,
          i.closingBalanceMinor,
          i.currency,
          c.actorId,
          c.correlationId,
        ],
      );
      for (const importId of ids)
        await q.query(
          "insert into bank_statement_session_imports(organization_id,session_id,import_id)values($1,$2,$3)",
          [c.organizationId, id, importId],
        );
      await this.audit(q, c, id, "create", 1n, null, { state: "draft", reason: i.reason.trim() });
      return {
        statementSession: await this.view(q, c.organizationId, id),
        mutation: {
          resourceVersion: "1",
          correlationId: c.correlationId,
          idempotencyReplayed: false,
          nextActions: ["get", "review"],
        },
      };
    });
  }
  async review(c: BankingControlContext, id: string, i: CloseStatementSessionInput, key: string) {
    return this.mutate(c, key, "bank-control:review", { id, i }, async (q) => {
      const s = await q.query<{ version: string; state: string }>(
        "select version::text,state from bank_statement_sessions where organization_id=$1 and id=$2 for update",
        [c.organizationId, id],
      );
      if (!s.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      if (s.rows[0].state !== "draft") throw new Error("BANK_CONTROL_SESSION_NOT_DRAFT");
      if (s.rows[0].version !== i.expectedResourceVersion) throw new Error("VERSION_CONFLICT");
      const version = BigInt(s.rows[0].version) + 1n;
      await q.query(
        "update bank_statement_sessions set state='reviewed',version=$3,reviewed_by=$4,reviewed_at=now(),review_reason=$5,updated_at=now()where organization_id=$1 and id=$2",
        [c.organizationId, id, version.toString(), c.actorId, i.reason.trim()],
      );
      await this.audit(
        q,
        c,
        id,
        "review",
        version,
        { state: "draft" },
        { state: "reviewed", reason: i.reason.trim() },
      );
      return {
        statementSession: await this.view(q, c.organizationId, id),
        mutation: {
          resourceVersion: version.toString(),
          correlationId: c.correlationId,
          idempotencyReplayed: false,
          nextActions: ["get", "create-exception", "close"],
        },
      };
    });
  }
  async close(c: BankingControlContext, id: string, i: CloseStatementSessionInput, key: string) {
    return this.mutate(c, key, "bank-control:close", { id, i }, async (q) => {
      const s = await q.query<{ version: string; state: string }>(
        "select version::text,state from bank_statement_sessions where organization_id=$1 and id=$2 for update",
        [c.organizationId, id],
      );
      if (!s.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      if (s.rows[0].state !== "reviewed") throw new Error("BANK_CONTROL_SESSION_NOT_REVIEWED");
      if (s.rows[0].version !== i.expectedResourceVersion) throw new Error("VERSION_CONFLICT");
      const control = await this.control(q, c.organizationId, id);
      if (!control.canClose) throw new Error("BANK_CONTROL_CLOSE_BLOCKED");
      const version = BigInt(s.rows[0].version) + 1n;
      await q.query(
        "update bank_statement_sessions set state='closed',version=$3,closed_by=$4,closed_at=now(),close_reason=$5,updated_at=now()where organization_id=$1 and id=$2",
        [c.organizationId, id, version.toString(), c.actorId, i.reason.trim()],
      );
      await this.audit(
        q,
        c,
        id,
        "close",
        version,
        { state: "reviewed" },
        { state: "closed", control, reason: i.reason.trim() },
      );
      return {
        statementSession: await this.view(q, c.organizationId, id),
        mutation: {
          resourceVersion: version.toString(),
          correlationId: c.correlationId,
          idempotencyReplayed: false,
          nextActions: ["get"],
        },
      };
    });
  }
  async createException(
    c: BankingControlContext,
    sessionId: string,
    i: CreateControlExceptionInput,
    key: string,
  ) {
    return this.mutate(c, key, "bank-control:exception:create", { sessionId, i }, async (q) => {
      const s = await q.query<{ currency: string; state: string }>(
        "select currency,state from bank_statement_sessions where organization_id=$1 and id=$2 for update",
        [c.organizationId, sessionId],
      );
      if (!s.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      if (s.rows[0].state !== "reviewed") throw new Error("BANK_CONTROL_SESSION_NOT_REVIEWED");
      if (s.rows[0].currency !== i.currency) throw new Error("BANK_CONTROL_CURRENCY_MISMATCH");
      if (i.bankTransactionId) {
        const t = await q.query(
          "select 1 from bank_transactions where organization_id=$1 and id=$2",
          [c.organizationId, i.bankTransactionId],
        );
        if (!t.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      }
      const id = i.id ?? randomUUID();
      await q.query(
        "insert into bank_control_exceptions(organization_id,id,session_id,bank_transaction_id,kind,amount_minor,currency,owner_id,reason,review_due,created_by,correlation_id)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        [
          c.organizationId,
          id,
          sessionId,
          i.bankTransactionId ?? null,
          i.kind,
          i.amountMinor,
          i.currency,
          i.ownerId,
          i.reason.trim(),
          i.reviewDue,
          c.actorId,
          c.correlationId,
        ],
      );
      await this.audit(q, c, `${sessionId}:${id}`, "create_exception", 1n, null, {
        status: "pending",
      });
      return {
        statementSession: await this.view(q, c.organizationId, sessionId),
        mutation: {
          resourceVersion: "1",
          correlationId: c.correlationId,
          idempotencyReplayed: false,
          nextActions: ["approve", "resolve", "reject"],
        },
      };
    });
  }
  async reviewException(
    c: BankingControlContext,
    sessionId: string,
    id: string,
    action: "approve" | "resolve" | "reject",
    i: ReviewControlExceptionInput,
    key: string,
  ) {
    return this.mutate(
      c,
      key,
      `bank-control:exception:${action}`,
      { sessionId, id, i },
      async (q) => {
        const x = await q.query<{ version: string; status: string }>(
          "select version::text,status from bank_control_exceptions where organization_id=$1 and session_id=$2 and id=$3 for update",
          [c.organizationId, sessionId, id],
        );
        if (!x.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
        if (x.rows[0].version !== i.expectedResourceVersion) throw new Error("VERSION_CONFLICT");
        if (!["pending", "approved"].includes(x.rows[0].status))
          throw new Error("BANK_CONTROL_EXCEPTION_FINAL");
        const status =
            action === "approve" ? "approved" : action === "resolve" ? "resolved" : "rejected",
          version = BigInt(x.rows[0].version) + 1n;
        const fields =
          action === "approve"
            ? "approved_by=$5,approved_at=now(),approval_reason=$6"
            : action === "resolve"
              ? "resolved_by=$5,resolved_at=now(),resolution_reason=$6"
              : "rejected_by=$5,rejected_at=now(),rejection_reason=$6";
        await q.query(
          `update bank_control_exceptions set status=$4,version=$7,${fields},resolution_reference=case when $4='resolved' then $8 else resolution_reference end,updated_at=now()where organization_id=$1 and session_id=$2 and id=$3`,
          [
            c.organizationId,
            sessionId,
            id,
            status,
            c.actorId,
            i.reason.trim(),
            version.toString(),
            "resolutionReference" in i ? i.resolutionReference : null,
          ],
        );
        await this.audit(
          q,
          c,
          `${sessionId}:${id}`,
          `${action}_exception`,
          version,
          { status: x.rows[0].status },
          { status },
        );
        return {
          statementSession: await this.view(q, c.organizationId, sessionId),
          mutation: {
            resourceVersion: version.toString(),
            correlationId: c.correlationId,
            idempotencyReplayed: false,
            nextActions: status === "approved" ? ["resolve"] : [],
          },
        };
      },
    );
  }
  view = viewOperation;
  async transactions(q: Pick<PoolClient, "query"> | pg.Pool, org: string, sessionId: string) {
    const result = await q.query<{
      id: string;
      bankTransactionId: string;
      importId: string;
      bookingDate: string;
      amountMinor: string;
      disposition: "accepted" | "duplicate";
      controlStatus: "unexplained" | "reconciled" | "internal_transfer" | "ignored" | "suspense";
      explanationReference: string | null;
      dispositionReason: string | null;
    }>(
      `select concat(r.import_id,':',r.row_number) id,t.id "bankTransactionId",r.import_id "importId",t.booking_date::text "bookingDate",t.amount_minor::text "amountMinor",
        case when r.outcome='imported' then 'accepted' else 'duplicate' end disposition,
        case when r.outcome='duplicate' then 'ignored'
          when exists(select 1 from reconciliation_adjustments a join reconciliation_attempts ra on ra.organization_id=a.organization_id and ra.id=a.reconciliation_id where a.organization_id=t.organization_id and ra.bank_transaction_id=t.id and a.kind='suspense') then 'suspense'
          when exists(select 1 from internal_transfer_claims c where c.organization_id=t.organization_id and c.bank_transaction_id=t.id) then 'internal_transfer'
          when t.state='reconciled' then 'reconciled' when t.state='ignored' then 'ignored' else 'unexplained' end "controlStatus",
        coalesce((select ra.reconciliation_id from reconciliation_attempts ra where ra.organization_id=t.organization_id and ra.bank_transaction_id=t.id and ra.journal_id is not null order by ra.attempt_number desc limit 1),(select c.transfer_id from internal_transfer_claims c where c.organization_id=t.organization_id and c.bank_transaction_id=t.id limit 1),(select e.id from bank_transaction_events e where e.organization_id=t.organization_id and e.transaction_id=t.id and e.to_state='ignored' order by e.occurred_at desc limit 1),case when t.state in('reconciled','ignored') then t.id end) "explanationReference",
        case when r.outcome='duplicate' then 'Duplicate import row excluded from statement movement' else null end "dispositionReason"
       from bank_statement_session_imports x join bank_statement_import_rows r on r.organization_id=x.organization_id and r.import_id=x.import_id
       join bank_transactions t on t.organization_id=r.organization_id and t.id=r.transaction_id
       where x.organization_id=$1 and x.session_id=$2 and r.transaction_id is not null order by r.import_id,r.row_number`,
      [org, sessionId],
    );
    return result.rows.map((row) => ({
      ...row,
      ...(row.explanationReference ? { explanationReference: row.explanationReference } : {}),
      ...(row.dispositionReason ? { dispositionReason: row.dispositionReason } : {}),
    }));
  }
  control = controlOperation;
  async mutate(
    c: BankingControlContext,
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
        "select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2 for update",
        [c.organizationId, key],
      );
      if (old.rows[0]) {
        if (old.rows[0].request_hash !== h) throw new Error("IDEMPOTENCY_CONFLICT");
        await q.query("rollback");
        return { ...old.rows[0].response_body, idempotencyReplayed: true };
      }
      const out = await fn(q);
      await q.query(
        "insert into api_idempotency_records(organization_id,idempotency_key,operation,request_hash,response_body)values($1,$2,$3,$4,$5)",
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
  audit(
    q: PoolClient,
    c: BankingControlContext,
    key: string,
    action: string,
    version: bigint,
    before: unknown,
    after: unknown,
  ) {
    return q.query(
      "insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)values($1,$2,'bank_statement_control',$3,$4,$5,$6,$7,$8,$9)",
      [
        c.organizationId,
        randomUUID(),
        key,
        version.toString(),
        action,
        c.actorId,
        c.correlationId,
        before,
        after,
      ],
    );
  }
}
