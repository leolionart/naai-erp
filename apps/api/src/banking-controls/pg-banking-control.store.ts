import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg, { type PoolClient } from "pg";
import type {
  BankingControlContext,
  CloseStatementSessionInput,
  CreateControlExceptionInput,
  CreateStatementSessionInput,
  ReviewControlExceptionInput,
} from "./banking-control.types.js";
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
@Injectable()
export class PgBankingControlStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
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
  private async view(q: Pick<PoolClient, "query"> | pg.Pool, org: string, id: string) {
    const s = await q.query<{
      id: string;
      financialAccountId: string;
      periodStart: string;
      periodEnd: string;
      openingBalanceMinor: string;
      closingBalanceMinor: string;
      currency: string;
      state: "draft" | "reviewed" | "closed";
      resourceVersion: string;
      reviewedBy: string | null;
      reviewedAt: string | null;
      closedBy: string | null;
      closedAt: string | null;
    }>(
      'select id,financial_account_id "financialAccountId",period_start::text "periodStart",period_end::text "periodEnd",opening_balance_minor::text "openingBalanceMinor",closing_balance_minor::text "closingBalanceMinor",currency,state,version::text "resourceVersion",reviewed_by "reviewedBy",reviewed_at "reviewedAt",closed_by "closedBy",closed_at "closedAt" from bank_statement_sessions where organization_id=$1 and id=$2',
      [org, id],
    );
    if (!s.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    const imports = await q.query(
      `select i.id "importId",count(r.*)::int "transactionCount",count(r.*) filter(where r.outcome='imported')::int "acceptedTransactionCount"
       from bank_statement_session_imports x join bank_statement_imports i on i.organization_id=x.organization_id and i.id=x.import_id
       left join bank_statement_import_rows r on r.organization_id=i.organization_id and r.import_id=i.id and r.transaction_id is not null
       where x.organization_id=$1 and x.session_id=$2 group by i.id order by i.id`,
      [org, id],
    );
    const exceptions = await q.query(
      `select id,kind,bank_transaction_id "bankTransactionId",amount_minor::text "amountMinor",currency,reason,owner_id "ownerId",review_due::text "reviewDue",status state,created_by "createdBy",created_at "createdAt",approved_by "approvedBy",approved_at "approvedAt",approval_reason "approvalReason",resolved_by "resolvedBy",resolved_at "resolvedAt",resolution_reference "resolutionReference",resolution_reason "resolutionReason",rejected_by "rejectedBy",rejected_at "rejectedAt",rejection_reason "rejectionReason" from bank_control_exceptions where organization_id=$1 and session_id=$2 order by review_due,id`,
      [org, id],
    );
    const transactions = await this.transactions(q, org, id),
      controlDetail = await this.control(q, org, id);
    const events = await q.query<{
      action: string;
      actorId: string;
      occurredAt: string;
      reason: string;
      correlationId: string;
    }>(
      `select action,actor_id "actorId",occurred_at "occurredAt",coalesce(after_state->>'reason',before_state->>'reason',action) reason,correlation_id "correlationId" from resource_audit_events where organization_id=$1 and resource_type='bank_statement_control' and (resource_key=$2 or resource_key like $2||':%') order by occurred_at,id`,
      [org, id],
    );
    const session = {
      ...s.rows[0],
      importIds: imports.rows.map((x: { importId: string }) => x.importId),
      nextActions:
        s.rows[0].state === "draft"
          ? ["review"]
          : s.rows[0].state === "reviewed"
            ? ["create_exception", "close"]
            : [],
      events: events.rows.map((event, index) => ({ sequence: index + 1, ...event })),
      ...(s.rows[0].reviewedBy
        ? { reviewedBy: s.rows[0].reviewedBy, reviewedAt: s.rows[0].reviewedAt! }
        : {}),
      ...(s.rows[0].closedBy
        ? { closedBy: s.rows[0].closedBy, closedAt: s.rows[0].closedAt! }
        : {}),
    };
    const control = {
      expectedMovementMinor: controlDetail.balance.statementMovementMinor,
      controlDifferenceMinor: controlDetail.balance.differenceMinor,
      acceptedTransactionCount: transactions.filter((x) => x.disposition === "accepted").length,
      explainedTransactionCount: transactions.filter(
        (x) => x.disposition === "accepted" && x.controlStatus !== "unexplained",
      ).length,
      pendingExceptionCount: exceptions.rows.filter((x: { state: string }) => x.state === "pending")
        .length,
      closeBlockers: controlDetail.blockingCodes,
      closable: controlDetail.canClose,
    };
    return {
      session,
      imports: imports.rows,
      transactions,
      exceptions: exceptions.rows,
      control,
    };
  }
  private async transactions(
    q: Pick<PoolClient, "query"> | pg.Pool,
    org: string,
    sessionId: string,
  ) {
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
  private async control(q: Pick<PoolClient, "query"> | pg.Pool, org: string, id: string) {
    const s = (
      await q.query<{
        financial_account_id: string;
        period_start: string;
        period_end: string;
        opening_balance_minor: string;
        closing_balance_minor: string;
        currency: string;
        ledger_account_code: string;
        state: string;
      }>(
        "select s.financial_account_id,s.period_start::text,s.period_end::text,s.opening_balance_minor::text,s.closing_balance_minor::text,s.currency,s.state,a.ledger_account_code from bank_statement_sessions s join financial_accounts a on a.organization_id=s.organization_id and a.id=s.financial_account_id where s.organization_id=$1 and s.id=$2",
        [org, id],
      )
    ).rows[0];
    if (!s) throw new Error("RESOURCE_NOT_FOUND");
    const rows = (
      await q.query<{
        row_count: string;
        imported: string;
        duplicate: string;
        rejected: string;
        actual: string;
      }>(
        `select
          coalesce(sum(i.row_count),0)::text row_count,
          coalesce(sum(i.imported_count),0)::text imported,
          coalesce(sum(i.duplicate_count),0)::text duplicate,
          coalesce(sum(i.rejected_count),0)::text rejected,
          coalesce((select count(*) from bank_statement_session_imports sx join bank_statement_import_rows r on r.organization_id=sx.organization_id and r.import_id=sx.import_id where sx.organization_id=$1 and sx.session_id=$2),0)::text actual
         from bank_statement_session_imports x join bank_statement_imports i on i.organization_id=x.organization_id and i.id=x.import_id
         where x.organization_id=$1 and x.session_id=$2`,
        [org, id],
      )
    ).rows[0]!;
    const transactions = await this.transactions(q, org, id);
    const accepted = transactions.filter((t) => t.disposition === "accepted"),
      inPeriod = accepted.filter(
        (t) => t.bookingDate >= s.period_start && t.bookingDate <= s.period_end,
      ),
      movement = inPeriod.reduce((n, t) => n + BigInt(t.amountMinor), 0n),
      expected = BigInt(s.opening_balance_minor) + movement,
      balanceDiff = expected - BigInt(s.closing_balance_minor);
    const approved = await q.query<{ bank_transaction_id: string | null; kind: string }>(
      "select bank_transaction_id,kind from bank_control_exceptions where organization_id=$1 and session_id=$2 and status in('approved','resolved')",
      [org, id],
    );
    const covered = new Set(
      approved.rows.map((x) => x.bank_transaction_id).filter((x): x is string => Boolean(x)),
    );
    const uncovered = inPeriod.filter(
      (t) =>
        t.controlStatus === "unexplained" ||
        (t.controlStatus === "suspense" && !covered.has(t.bankTransactionId)),
    );
    const ledger = await q.query<{ amount: string }>(
      "select coalesce(sum(coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0)),0)::text amount from journal_entries j join journal_lines l on l.organization_id=j.organization_id and l.journal_id=j.id where j.organization_id=$1 and l.account_code=$2 and j.currency=$3 and j.journal_date between $4::date and $5::date and j.state in('posted','reversed')",
      [org, s.ledger_account_code, s.currency, s.period_start, s.period_end],
    );
    const ledgerMovement = BigInt(ledger.rows[0]?.amount ?? "0"),
      ledgerDiff = ledgerMovement - movement;
    const suspense = await q.query<{ id: string; amount: string; bank_transaction_id: string }>(
      "select a.id,a.base_amount_minor::text amount,r.bank_transaction_id from reconciliation_adjustments a join reconciliation_attempts r on r.organization_id=a.organization_id and r.id=a.reconciliation_id where a.organization_id=$1 and a.kind='suspense' and r.bank_transaction_id=any($2::text[])",
      [org, inPeriod.map((t) => t.bankTransactionId)],
    );
    const approvedSuspense = new Set(
      approved.rows.filter((x) => x.kind === "suspense").map((x) => x.bank_transaction_id),
    );
    const unapproved = suspense.rows.filter((x) => !approvedSuspense.has(x.bank_transaction_id));
    const importPassed =
        BigInt(rows.row_count) === BigInt(rows.actual) &&
        BigInt(rows.row_count) ===
          BigInt(rows.imported) + BigInt(rows.duplicate) + BigInt(rows.rejected),
      blocking: string[] = [];
    if (s.state !== "reviewed") blocking.push("statement_not_reviewed");
    if (balanceDiff !== 0n) blocking.push("control_total_mismatch");
    if (!importPassed) blocking.push("import_disposition_mismatch");
    for (const transaction of uncovered)
      blocking.push(
        transaction.controlStatus === "suspense"
          ? `unapproved_suspense:${transaction.bankTransactionId}`
          : `unexplained_transaction:${transaction.bankTransactionId}`,
      );
    if (accepted.length !== inPeriod.length) blocking.push("transaction_outside_session_period");
    if (ledgerDiff !== 0n) blocking.push("bank_ledger_movement_mismatch");
    return {
      balance: {
        openingBalanceMinor: s.opening_balance_minor,
        statementMovementMinor: movement.toString(),
        expectedClosingMinor: expected.toString(),
        reportedClosingMinor: s.closing_balance_minor,
        differenceMinor: balanceDiff.toString(),
        passed: balanceDiff === 0n,
      },
      importDispositions: {
        rowCount: rows.row_count,
        importedCount: rows.imported,
        duplicateCount: rows.duplicate,
        rejectedCount: rows.rejected,
        actualRowCount: rows.actual,
        passed: importPassed,
      },
      coverage: {
        transactionCount: inPeriod.length,
        reconciledCount: inPeriod.filter(
          (t) => t.controlStatus === "reconciled" || t.controlStatus === "internal_transfer",
        ).length,
        ignoredCount: inPeriod.filter((t) => t.controlStatus === "ignored").length,
        exceptionCoveredCount: inPeriod.filter((t) => covered.has(t.bankTransactionId)).length,
        uncoveredTransactionIds: uncovered.map((t) => t.bankTransactionId),
        passed: uncovered.length === 0 && accepted.length === inPeriod.length,
      },
      ledgerTie: {
        ledgerAccountCode: s.ledger_account_code,
        statementMovementMinor: movement.toString(),
        postedLedgerMovementMinor: ledgerMovement.toString(),
        differenceMinor: ledgerDiff.toString(),
        passed: ledgerDiff === 0n,
      },
      suspense: {
        suspenseCount: suspense.rows.length,
        unapprovedCount: unapproved.length,
        unapprovedAmountMinor: unapproved.reduce((n, x) => n + BigInt(x.amount), 0n).toString(),
        passed: unapproved.length === 0,
      },
      canClose: blocking.length === 0,
      blockingCodes: blocking,
    };
  }
  private async mutate(
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
  private audit(
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
