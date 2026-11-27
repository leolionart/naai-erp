import type pg from "pg";
import { type PoolClient } from "pg";
import type { PgBankingControlStore } from "./pg-banking-control.store.js";

export async function viewOperation(
  this: PgBankingControlStore,
  q: Pick<PoolClient, "query"> | pg.Pool,
  org: string,
  id: string,
) {
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
    ...(s.rows[0].closedBy ? { closedBy: s.rows[0].closedBy, closedAt: s.rows[0].closedAt! } : {}),
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

export async function controlOperation(
  this: PgBankingControlStore,
  q: Pick<PoolClient, "query"> | pg.Pool,
  org: string,
  id: string,
) {
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
