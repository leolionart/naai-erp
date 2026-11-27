import { randomUUID } from "node:crypto";
import { type PoolClient } from "pg";
import type { ExpenseContext } from "./expense.types.js";
import { type StoredExpense } from "./pg-expense.store.shared.js";
import type { PgExpenseStore } from "./pg-expense.store.js";

export async function postJournalOperation(
  this: PgExpenseStore,
  c: PoolClient,
  context: ExpenseContext,
  e: StoredExpense,
) {
  if (e.funding_financial_account_id) {
    const funding = await c.query<{ ledger_account_code: string }>(
      `select ledger_account_code from financial_accounts
         where organization_id=$1 and id=$2 and currency=$3 and status='active' for update`,
      [context.organizationId, e.funding_financial_account_id, e.currency],
    );
    if (!funding.rows[0]) throw new Error("EXPENSE_FUNDING_ACCOUNT_NOT_AVAILABLE");
    if (funding.rows[0].ledger_account_code !== e.counter_account_code)
      throw new Error("EXPENSE_FUNDING_ACCOUNT_MISMATCH");
  }
  const journalId = randomUUID();
  const lines = await c.query<{
    line_number: number;
    description: string;
    net_minor: string;
    vat_minor: string;
    posting_account_code: string;
    vat_account_code: string | null;
    vat_eligible_minor: string;
    dimensions: Record<string, string>;
  }>(
    `select line_number,description,net_minor::text,vat_minor::text,posting_account_code,vat_account_code,vat_eligible_minor::text,dimensions from expense_lines where organization_id=$1 and expense_id=$2`,
    [context.organizationId, e.id],
  );
  const out: Array<{
    account: string;
    debit?: bigint;
    credit?: bigint;
    description: string;
    dimensions: Record<string, string>;
  }> = [];
  for (const l of lines.rows) {
    const a = await c.query<{ amount_minor: string; dimensions: Record<string, string> }>(
      "select amount_minor::text,dimensions from expense_allocations where organization_id=$1 and expense_id=$2 and line_number=$3 order by allocation_number",
      [context.organizationId, e.id, l.line_number],
    );
    if (a.rows.reduce((s, x) => s + BigInt(x.amount_minor), 0n) !== BigInt(l.net_minor))
      throw new Error("EXPENSE_ALLOCATION_MISMATCH");
    let vatAllocated = 0n,
      ineligibleAllocated = 0n;
    const eligibleVat = BigInt(l.vat_eligible_minor),
      ineligibleVat = BigInt(l.vat_minor) - eligibleVat;
    for (const [index, x] of a.rows.entries()) {
      const net = BigInt(x.amount_minor);
      const eligible =
        index === a.rows.length - 1
          ? eligibleVat - vatAllocated
          : (eligibleVat * net) / BigInt(l.net_minor);
      vatAllocated += eligible;
      const ineligible =
        index === a.rows.length - 1
          ? ineligibleVat - ineligibleAllocated
          : (ineligibleVat * net) / BigInt(l.net_minor);
      ineligibleAllocated += ineligible;
      const dims = {
        ...l.dimensions,
        ...x.dimensions,
        sourceExpenseId: e.id,
        sourceLineNumber: String(l.line_number),
      };
      out.push({
        account: l.posting_account_code,
        debit: net + ineligible,
        description: l.description,
        dimensions: dims,
      });
      if (eligible > 0n)
        out.push({
          account: l.vat_account_code!,
          debit: eligible,
          description: `VAT ${l.description}`,
          dimensions: dims,
        });
    }
  }
  out.push({
    account: e.counter_account_code,
    credit: BigInt(e.gross_minor),
    description: e.id,
    dimensions: {
      payeePartyId: e.payee_party_id ?? "",
      employeePartyId: e.employee_party_id ?? "",
      sourceExpenseId: e.id,
    },
  });
  const debit = out.reduce((s, x) => s + (x.debit ?? 0n), 0n),
    credit = out.reduce((s, x) => s + (x.credit ?? 0n), 0n);
  if (debit !== credit) throw new Error("JOURNAL_UNBALANCED");
  await c.query(
    `insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by) values($1,$2,$3,$4,$5,'posted',2,$6,now(),$6,'Expense workflow',now(),$6)`,
    [
      context.organizationId,
      journalId,
      e.expense_date,
      `Expense ${e.id}`,
      e.currency,
      context.actorId,
    ],
  );
  for (const [index, x] of out.entries())
    await c.query(
      `insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions) values($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        context.organizationId,
        journalId,
        index + 1,
        x.account,
        x.debit?.toString() ?? null,
        x.credit?.toString() ?? null,
        x.description,
        x.dimensions,
      ],
    );
  await c.query(
    `insert into outbox_events(organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id) values($1,$2,'journal',$3,'journal.posted',1,$4,$5)`,
    [
      context.organizationId,
      randomUUID(),
      journalId,
      { journalId, sourceExpenseId: e.id },
      context.correlationId,
    ],
  );
  return journalId;
}

/**
 * Ensures the linked journal is reversed once: posts a balancing reversal when `posted`, or
 * returns the existing reversal journal ID when the journal was already `reversed` directly.
 */
export async function ensureJournalReversedOperation(
  this: PgExpenseStore,
  c: PoolClient,
  context: ExpenseContext,
  journalId: string,
  reversalDate: string,
  reason: string,
): Promise<string> {
  const journal = await c.query<{ state: string; currency: string }>(
    `select state,currency from journal_entries where organization_id=$1 and id=$2 for update`,
    [context.organizationId, journalId],
  );
  const row = journal.rows[0];
  if (!row) throw new Error("INVALID_JOURNAL_STATE");
  if (row.state === "reversed") {
    const existing = await c.query<{ id: string }>(
      `select id from journal_entries
        where organization_id=$1 and reversal_of_id=$2
        order by created_at desc limit 1`,
      [context.organizationId, journalId],
    );
    if (!existing.rows[0]) throw new Error("INVALID_JOURNAL_STATE");
    return existing.rows[0].id;
  }
  if (row.state !== "posted") throw new Error("INVALID_JOURNAL_STATE");
  const reversalJournalId = randomUUID();
  await c.query(
    `insert into journal_entries(organization_id,id,journal_date,description,currency,state,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by,reversal_of_id,version)
     values($1,$2,$3,$4,$5,'posted',$6,now(),$6,$7,now(),$6,$8,3)`,
    [
      context.organizationId,
      reversalJournalId,
      reversalDate,
      `Reversal of ${journalId}: ${reason}`,
      row.currency,
      context.actorId,
      reason,
      journalId,
    ],
  );
  await c.query(
    `insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)
     select organization_id,$3,line_number,account_code,credit_minor,debit_minor,description,dimensions
     from journal_lines where organization_id=$1 and journal_id=$2`,
    [context.organizationId, journalId, reversalJournalId],
  );
  await c.query(
    `update journal_entries set state='reversed',version=version+1,updated_at=now() where organization_id=$1 and id=$2`,
    [context.organizationId, journalId],
  );
  return reversalJournalId;
}

export async function createFreelancePayableOperation(
  this: PgExpenseStore,
  c: PoolClient,
  context: ExpenseContext,
  expense: StoredExpense,
  journalId: string,
) {
  if (!expense.payee_party_id || !expense.freelance_due_date)
    throw new Error("FREELANCE_EXPENSE_RELATIONSHIPS_REQUIRED");
  const role = await c.query(
    `select 1 from party_roles where organization_id=$1 and party_id=$2 and role='freelancer'`,
    [context.organizationId, expense.payee_party_id],
  );
  if (!role.rows[0]) throw new Error("FREELANCER_ROLE_REQUIRED");
  const project = await c.query<{ project_id: string }>(
    `select distinct project_id from (
       select dimensions->>'projectId' project_id from expense_lines where organization_id=$1 and expense_id=$2
       union select dimensions->>'projectId' from expense_allocations where organization_id=$1 and expense_id=$2
     ) x where project_id is not null`,
    [context.organizationId, expense.id],
  );
  if (project.rows.length !== 1) throw new Error("FREELANCE_EXPENSE_PROJECT_REQUIRED");
  await c.query(
    `insert into project_freelance_payables
     (organization_id,id,expense_id,project_id,freelancer_party_id,due_date,amount_minor,currency,journal_id,created_by)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      context.organizationId,
      randomUUID(),
      expense.id,
      project.rows[0]!.project_id,
      expense.payee_party_id,
      expense.freelance_due_date,
      expense.gross_minor,
      expense.currency,
      journalId,
      context.actorId,
    ],
  );
}
