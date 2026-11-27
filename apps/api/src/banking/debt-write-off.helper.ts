import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { BankingContext } from "./banking.types.js";

export type OwnerDebtWriteOffInput = Readonly<{
  schemaVersion: 1;
  bookingDate: string;
  amountMinor: string;
  currency: string;
  description: string;
  reason: string;
}>;

export type SalesInvoiceWriteOffInput = Readonly<{
  writeOffDate: string;
  amountMinor: string;
  reason: string;
  expenseAccountCode?: string;
}>;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function replayIdempotency(
  client: PoolClient,
  organizationId: string,
  key: string,
  requestHash: string,
) {
  const existing = await client.query<{
    request_hash: string;
    response_body: Record<string, unknown>;
  }>(
    `select request_hash, response_body from idempotency_records where organization_id=$1 and idempotency_key=$2`,
    [organizationId, key],
  );
  if (!existing.rows[0]) return null;
  if (existing.rows[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_KEY_CONFLICT");
  return existing.rows[0].response_body;
}

async function saveIdempotency(
  client: PoolClient,
  organizationId: string,
  key: string,
  operation: string,
  requestHash: string,
  responseBody: Record<string, unknown>,
) {
  await client.query(
    `insert into idempotency_records (organization_id, idempotency_key, operation, request_hash, status_code, response_body)
     values ($1, $2, $3, $4, 200, $5)`,
    [organizationId, key, operation, requestHash, JSON.stringify(responseBody)],
  );
}

async function assertOpenPeriod(client: PoolClient, organizationId: string, date: string) {
  const found = await client.query<{ state: string }>(
    `select state::text from fiscal_periods
     where organization_id=$1 and starts_on <= $2::date and ends_on >= $2::date limit 1`,
    [organizationId, date],
  );
  if (!found.rows[0] || !["open", "reopened"].includes(found.rows[0].state)) {
    throw new Error("PERIOD_CLOSED");
  }
}

async function recordAuditAndOutbox(
  client: PoolClient,
  context: BankingContext,
  entityType: string,
  entityId: string,
  action: string,
  eventType: string,
  afterState: Record<string, unknown>,
) {
  const auditEventId = randomUUID();
  const outboxEventId = randomUUID();
  await client.query(
    `insert into audit_events (organization_id, id, actor_id, actor_role, correlation_id, entity_type, entity_id, action, version, before_state, after_state)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 1, null, $9)`,
    [
      context.organizationId,
      auditEventId,
      context.actorId,
      context.roles[0] ?? "owner",
      context.correlationId,
      entityType,
      entityId,
      action,
      JSON.stringify(afterState),
    ],
  );
  await client.query(
    `insert into outbox_events (organization_id, id, aggregate_type, aggregate_id, event_type, schema_version, payload, correlation_id)
     values ($1, $2, $3, $4, $5, 1, $6, $7)`,
    [
      context.organizationId,
      outboxEventId,
      entityType,
      entityId,
      eventType,
      JSON.stringify(afterState),
      context.correlationId,
    ],
  );
  return { auditEventId, outboxEventId };
}

/**
 * Post an owner debt write-off (waiver) converting `3388-OWNER` liability into contributed equity (`411-CAPITAL`).
 */
export async function executeOwnerDebtWriteOff(
  pool: Pool,
  context: BankingContext,
  input: OwnerDebtWriteOffInput,
  idempotencyKey: string,
) {
  if (
    input.schemaVersion !== 1 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.bookingDate) ||
    !/^\d+$/.test(input.amountMinor) ||
    BigInt(input.amountMinor) <= 0n ||
    !/^[A-Z]{3}$/.test(input.currency) ||
    !input.description?.trim() ||
    !input.reason?.trim()
  ) {
    throw new Error("VALIDATION_FAILED");
  }
  const normalized = {
    ...input,
    amountMinor: BigInt(input.amountMinor).toString(),
    description: input.description.trim(),
    reason: input.reason.trim(),
  };
  const requestHash = sha256(JSON.stringify(normalized));
  const client = await pool.connect();
  try {
    await client.query("begin");
    const replay = await replayIdempotency(
      client,
      context.organizationId,
      idempotencyKey,
      requestHash,
    );
    if (replay) {
      await client.query("rollback");
      return { ...replay, idempotencyReplayed: true };
    }
    await assertOpenPeriod(client, context.organizationId, normalized.bookingDate);
    const ownerAcct = await client.query<{ account_code: string }>(
      `with selected_mapping as (
         select id, version from financial_statement_mapping_versions
         where organization_id=$1 and framework='TT133'
           and (state='approved' or exists(select 1 from accounting_workflow_policies w where w.organization_id=$1 and w.operating_mode='solopreneur'))
           and effective_from <= $2::date and (effective_to is null or effective_to >= $2::date)
         order by (state='approved') desc, effective_from desc, version desc limit 1
       )
       select ml.account_code
       from selected_mapping sm
       join financial_statement_mapping_lines ml on ml.organization_id=$1 and ml.mapping_id=sm.id and ml.mapping_version=sm.version
       join accounts a on a.organization_id=ml.organization_id and a.code=ml.account_code
       where ml.statement='balance_sheet' and ml.line_code='owner_current' and a.is_active=true
       order by ml.account_code limit 1`,
      [context.organizationId, normalized.bookingDate],
    );
    const ownerAccountCode = ownerAcct.rows[0]?.account_code;
    if (!ownerAccountCode) throw new Error("OWNER_CURRENT_ACCOUNT_NOT_CONFIGURED");

    const equityAcct = await client.query<{ code: string }>(
      `select code from accounts
       where organization_id=$1 and root_type='equity' and is_active=true and code in ('411-CAPITAL', '411')
       order by (code='411-CAPITAL') desc, code limit 1`,
      [context.organizationId],
    );
    const equityAccountCode = equityAcct.rows[0]?.code;
    if (!equityAccountCode) throw new Error("EQUITY_CAPITAL_ACCOUNT_NOT_CONFIGURED");

    const balRes = await client.query<{ balance: string }>(
      `select coalesce(sum(coalesce(jl.credit_minor, 0) - coalesce(jl.debit_minor, 0)), 0)::text balance
       from journal_lines jl
       join journal_entries je on je.organization_id=jl.organization_id and je.id=jl.journal_id
       where jl.organization_id=$1 and jl.account_code=$2 and je.state in ('posted', 'reversed')`,
      [context.organizationId, ownerAccountCode],
    );
    const currentBalance = BigInt(balRes.rows[0]?.balance ?? "0");
    if (BigInt(normalized.amountMinor) > currentBalance) {
      throw new Error("OWNER_DEBT_WRITE_OFF_EXCEEDS_BALANCE");
    }

    const writeOffId = randomUUID();
    const journalId = randomUUID();
    const dims = JSON.stringify({ ownerDebtWriteOff: "true", writeOffId });
    await client.query(
      `insert into journal_entries
       (organization_id, id, journal_date, description, currency, state, version, created_by, approved_at, approved_by, approval_reason, posted_at, posted_by)
       values ($1, $2, $3, $4, $5, 'posted', 2, $6, now(), $6, $7, now(), $6)`,
      [
        context.organizationId,
        journalId,
        normalized.bookingDate,
        normalized.description,
        normalized.currency,
        context.actorId,
        normalized.reason,
      ],
    );
    await client.query(
      `insert into journal_lines (organization_id, journal_id, line_number, account_code, debit_minor, credit_minor, description, dimensions)
       values ($1, $2, 1, $3, $4, null, $5, $7), ($1, $2, 2, $6, null, $4, $5, $7)`,
      [
        context.organizationId,
        journalId,
        ownerAccountCode,
        normalized.amountMinor,
        normalized.description,
        equityAccountCode,
        dims,
      ],
    );

    const after = {
      writeOffId,
      journalId,
      ownerAccountCode,
      equityAccountCode,
      bookingDate: normalized.bookingDate,
      amountMinor: normalized.amountMinor,
      currency: normalized.currency,
      state: "posted",
    };
    const { auditEventId, outboxEventId } = await recordAuditAndOutbox(
      client,
      context,
      "owner_debt_write_off",
      writeOffId,
      "create",
      "owner_debt_write_off.posted",
      after,
    );
    const response = {
      ...after,
      resourceVersion: "1",
      auditEventId,
      outboxEventId,
      idempotencyReplayed: false,
      nextActions: ["get_journal", "list_owner_current_movements"],
    };
    await saveIdempotency(
      client,
      context.organizationId,
      idempotencyKey,
      "banking:owner-debt-write-off:create",
      requestHash,
      response,
    );
    await client.query("commit");
    return response;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Write off an uncollectible `sales_invoice` AR balance (`Dr 642-OPEX / Cr 131-AR`) and update invoice/AR aging state.
 */
export async function executeSalesInvoiceBadDebtWriteOff(
  pool: Pool,
  context: BankingContext,
  documentId: string,
  input: SalesInvoiceWriteOffInput,
  idempotencyKey: string,
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.writeOffDate) ||
    !/^\d+$/.test(input.amountMinor) ||
    BigInt(input.amountMinor) <= 0n ||
    !input.reason?.trim()
  ) {
    throw new Error("VALIDATION_FAILED");
  }
  const normalized = {
    documentId,
    writeOffDate: input.writeOffDate,
    amountMinor: BigInt(input.amountMinor).toString(),
    reason: input.reason.trim(),
    expenseAccountCode: input.expenseAccountCode?.trim() || "642-OPEX",
  };
  const requestHash = sha256(JSON.stringify(normalized));
  const client = await pool.connect();
  try {
    await client.query("begin");
    const replay = await replayIdempotency(
      client,
      context.organizationId,
      idempotencyKey,
      requestHash,
    );
    if (replay) {
      await client.query("rollback");
      return { ...replay, idempotencyReplayed: true };
    }
    await assertOpenPeriod(client, context.organizationId, normalized.writeOffDate);

    const docRes = await client.query<{
      id: string;
      type: string;
      state: string;
      party_id: string;
      document_number: string;
      currency: string;
      gross_minor: string;
      control_account_code: string;
      version: string;
    }>(
      `select id, type::text, state::text, party_id, document_number, currency, gross_minor::text, control_account_code, version::text
       from commercial_documents
       where organization_id=$1 and id=$2 for update`,
      [context.organizationId, documentId],
    );
    const doc = docRes.rows[0];
    if (!doc) throw new Error("RESOURCE_NOT_FOUND");
    if (doc.type !== "sales_invoice" || !["issued", "partially_paid"].includes(doc.state)) {
      throw new Error("INVALID_STATE_TRANSITION");
    }

    const expAcct = await client.query<{ code: string }>(
      `select code from accounts where organization_id=$1 and code=$2 and root_type='expense' and is_active=true limit 1`,
      [context.organizationId, normalized.expenseAccountCode],
    );
    if (!expAcct.rows[0]) throw new Error("EXPENSE_ACCOUNT_NOT_AVAILABLE");

    const settledRes = await client.query<{ settled: string }>(
      `select (
         coalesce((
           select sum(a.target_amount_minor)
           from reconciliation_allocations a
           join reconciliation_attempts ra on ra.organization_id=a.organization_id and ra.id=a.reconciliation_id
           where a.organization_id=$1 and a.commercial_document_id=$2 and ra.reversal_journal_id is null
         ), 0) +
         coalesce((
           select sum(a.amount_minor)
           from customer_receipt_allocations a
           where a.organization_id=$1 and a.sales_invoice_id=$2
         ), 0) +
         coalesce((
           select sum(jl.credit_minor)
           from journal_lines jl
           join journal_entries je on je.organization_id=jl.organization_id and je.id=jl.journal_id
           where jl.organization_id=$1 and je.state='posted'
             and jl.dimensions->>'badDebtWriteOff'='true'
             and jl.dimensions->>'sourceDocumentId'=$2
             and jl.credit_minor is not null
         ), 0)
       )::text settled`,
      [context.organizationId, documentId],
    );
    const outstanding = BigInt(doc.gross_minor) - BigInt(settledRes.rows[0]?.settled ?? "0");
    const writeOffAmount = BigInt(normalized.amountMinor);
    if (writeOffAmount > outstanding) throw new Error("WRITE_OFF_EXCEEDS_OUTSTANDING");

    const writeOffId = randomUUID();
    const journalId = randomUUID();
    const description = `Xóa nợ phải thu khó đòi hóa đơn ${doc.document_number}: ${normalized.reason}`;
    const dims = JSON.stringify({
      sourceDocumentId: documentId,
      badDebtWriteOff: "true",
      writeOffId,
      partyId: doc.party_id,
    });
    await client.query(
      `insert into journal_entries
       (organization_id, id, journal_date, description, currency, state, version, created_by, approved_at, approved_by, approval_reason, posted_at, posted_by)
       values ($1, $2, $3, $4, $5, 'posted', 2, $6, now(), $6, $7, now(), $6)`,
      [
        context.organizationId,
        journalId,
        normalized.writeOffDate,
        description,
        doc.currency,
        context.actorId,
        normalized.reason,
      ],
    );
    await client.query(
      `insert into journal_lines (organization_id, journal_id, line_number, account_code, debit_minor, credit_minor, description, dimensions)
       values ($1, $2, 1, $3, $4, null, $5, $7), ($1, $2, 2, $6, null, $4, $5, $7)`,
      [
        context.organizationId,
        journalId,
        normalized.expenseAccountCode,
        normalized.amountMinor,
        description,
        doc.control_account_code,
        dims,
      ],
    );

    const newState = writeOffAmount === outstanding ? "paid" : "partially_paid";
    const updatedDoc = await client.query<{ version: string }>(
      `update commercial_documents set state=$3::commercial_document_state, version=version+1, updated_at=now()
       where organization_id=$1 and id=$2 returning version::text`,
      [context.organizationId, documentId, newState],
    );
    const after = {
      writeOffId,
      documentId,
      documentNumber: doc.document_number,
      journalId,
      expenseAccountCode: normalized.expenseAccountCode,
      controlAccountCode: doc.control_account_code,
      amountMinor: normalized.amountMinor,
      remainingOutstandingMinor: (outstanding - writeOffAmount).toString(),
      documentState: newState,
      writeOffDate: normalized.writeOffDate,
    };
    const { auditEventId, outboxEventId } = await recordAuditAndOutbox(
      client,
      context,
      "commercial_document",
      documentId,
      "write_off_bad_debt",
      "commercial_document.bad_debt_written_off",
      after,
    );
    const response = {
      ...after,
      resourceVersion: updatedDoc.rows[0]?.version ?? doc.version,
      auditEventId,
      outboxEventId,
      idempotencyReplayed: false,
      nextActions: ["get_document", "get_journal", "ar_aging"],
    };
    await saveIdempotency(
      client,
      context.organizationId,
      idempotencyKey,
      "commercial-document:write-off:create",
      requestHash,
      response,
    );
    await client.query("commit");
    return response;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
