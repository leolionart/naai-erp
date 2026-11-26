import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { CommercialDocumentType } from "../commercial-documents/commercial-document.types.js";
import type { DraftRecordingActorContext } from "./draft-recording.types.js";

export async function postExpenseJournalOnClient(
  client: PoolClient,
  context: DraftRecordingActorContext,
  expense: {
    id: string;
    expense_date: string;
    currency: string;
    gross_minor: string;
    counter_account_code: string;
    employee_party_id: string | null;
    payee_party_id: string | null;
  },
  lines: ReadonlyArray<{
    line_number: number;
    description: string;
    net_minor: string;
    vat_minor: string;
    posting_account_code: string;
    vat_account_code: string | null;
    vat_eligible_minor: string;
    dimensions: Record<string, string>;
  }>,
  reason: string,
): Promise<string> {
  const journalId = randomUUID();
  const journalLines: Array<{
    account: string;
    debit?: bigint;
    credit?: bigint;
    description: string;
    dimensions: Record<string, string>;
  }> = [];

  for (const line of lines) {
    const allocs = await client.query<{ amount_minor: string; dimensions: Record<string, string> }>(
      `select amount_minor::text, dimensions from expense_allocations
        where organization_id = $1 and expense_id = $2 and line_number = $3
        order by allocation_number`,
      [context.organizationId, expense.id, line.line_number],
    );
    let vatAllocated = 0n;
    let ineligibleAllocated = 0n;
    const eligibleVat = BigInt(line.vat_eligible_minor);
    const ineligibleVat = BigInt(line.vat_minor) - eligibleVat;
    for (const [idx, alloc] of allocs.rows.entries()) {
      const net = BigInt(alloc.amount_minor);
      const eligible =
        idx === allocs.rows.length - 1
          ? eligibleVat - vatAllocated
          : (eligibleVat * net) / BigInt(line.net_minor);
      vatAllocated += eligible;
      const ineligible =
        idx === allocs.rows.length - 1
          ? ineligibleVat - ineligibleAllocated
          : (ineligibleVat * net) / BigInt(line.net_minor);
      ineligibleAllocated += ineligible;
      const dims = {
        ...line.dimensions,
        ...alloc.dimensions,
        sourceExpenseId: expense.id,
        sourceLineNumber: String(line.line_number),
      };
      journalLines.push({
        account: line.posting_account_code,
        debit: net + ineligible,
        description: line.description,
        dimensions: dims,
      });
      if (eligible > 0n) {
        journalLines.push({
          account: line.vat_account_code!,
          debit: eligible,
          description: `VAT ${line.description}`,
          dimensions: dims,
        });
      }
    }
  }

  journalLines.push({
    account: expense.counter_account_code,
    credit: BigInt(expense.gross_minor),
    description: expense.id,
    dimensions: {
      payeePartyId: expense.payee_party_id ?? "",
      employeePartyId: expense.employee_party_id ?? "",
      sourceExpenseId: expense.id,
    },
  });

  await insertBalancedPostedJournal(
    client,
    context,
    journalId,
    expense.expense_date,
    `Expense ${expense.id}`,
    expense.currency,
    reason,
    journalLines,
    { journalId, sourceExpenseId: expense.id },
  );
  return journalId;
}

export async function postDocumentJournalOnClient(
  client: PoolClient,
  context: DraftRecordingActorContext,
  document: {
    id: string;
    type: CommercialDocumentType;
    document_date: string;
    currency: string;
    party_id: string;
    document_number: string;
    gross_minor: string;
    control_account_code: string;
  },
  lines: ReadonlyArray<{
    line_number: number;
    description: string;
    net_minor: string;
    tax_minor: string;
    vat_state: string;
    payment_evidence_missing: boolean;
    primary_account_code: string;
    tax_account_code: string | null;
    dimensions: Record<string, string>;
  }>,
  reason: string,
): Promise<string> {
  const journalId = randomUUID();
  const journalLines: Array<{
    account: string;
    debit?: bigint;
    credit?: bigint;
    description: string;
    dimensions: Record<string, string>;
  }> = [];

  for (const line of lines) {
    const allocations = await client.query<{
      amount_minor: string;
      dimensions: Record<string, string>;
    }>(
      `select amount_minor::text, dimensions from commercial_document_allocations
        where organization_id = $1 and document_id = $2 and line_number = $3
        order by allocation_number`,
      [context.organizationId, document.id, line.line_number],
    );
    let allocatedTax = 0n;
    for (const [index, allocation] of allocations.rows.entries()) {
      const net = BigInt(allocation.amount_minor);
      const tax =
        index === allocations.rows.length - 1
          ? BigInt(line.tax_minor) - allocatedTax
          : (BigInt(line.tax_minor) * net) / BigInt(line.net_minor);
      allocatedTax += tax;
      const dimensions = {
        ...line.dimensions,
        ...allocation.dimensions,
        partyId: document.party_id,
        sourceDocumentId: document.id,
        sourceLineNumber: String(line.line_number),
      };
      if (document.type === "sales_invoice") {
        journalLines.push({
          account: line.primary_account_code,
          credit: net,
          description: line.description,
          dimensions,
        });
        if (tax > 0n) {
          journalLines.push({
            account: line.tax_account_code!,
            credit: tax,
            description: `VAT ${line.description}`,
            dimensions,
          });
        }
      } else if (document.type === "purchase_invoice") {
        const taxState = allocation.dimensions.taxState;
        const taxIsDeductible =
          line.payment_evidence_missing && line.vat_state === "unreviewed"
            ? false
            : taxState === undefined || taxState === "unreviewed"
              ? ["eligible", "accountant_override"].includes(line.vat_state)
              : ["eligible", "accountant_override"].includes(taxState);
        journalLines.push({
          account: line.primary_account_code,
          debit: net + (taxIsDeductible ? 0n : tax),
          description: line.description,
          dimensions,
        });
        if (tax > 0n && taxIsDeductible) {
          journalLines.push({
            account: line.tax_account_code!,
            debit: tax,
            description: `VAT ${line.description}`,
            dimensions,
          });
        }
      } else {
        journalLines.push({
          account: line.primary_account_code,
          debit: net,
          description: line.description,
          dimensions,
        });
        if (tax > 0n) {
          journalLines.push({
            account: line.tax_account_code!,
            debit: tax,
            description: `VAT credit ${line.description}`,
            dimensions,
          });
        }
      }
    }
  }

  const controlDimensions = {
    partyId: document.party_id,
    sourceDocumentId: document.id,
    documentNumber: document.document_number,
  };
  journalLines.push(
    document.type === "purchase_invoice" || document.type === "credit_note"
      ? {
          account: document.control_account_code,
          credit: BigInt(document.gross_minor),
          description: document.document_number,
          dimensions: controlDimensions,
        }
      : {
          account: document.control_account_code,
          debit: BigInt(document.gross_minor),
          description: document.document_number,
          dimensions: controlDimensions,
        },
  );

  await insertBalancedPostedJournal(
    client,
    context,
    journalId,
    document.document_date,
    `${document.type} ${document.document_number}`,
    document.currency,
    reason,
    journalLines,
    { journalId, sourceDocumentId: document.id },
  );
  return journalId;
}

async function insertBalancedPostedJournal(
  client: PoolClient,
  context: DraftRecordingActorContext,
  journalId: string,
  journalDate: string,
  description: string,
  currency: string,
  reason: string,
  journalLines: ReadonlyArray<{
    account: string;
    debit?: bigint;
    credit?: bigint;
    description: string;
    dimensions: Record<string, string>;
  }>,
  outboxPayload: Record<string, unknown>,
): Promise<void> {
  const debit = journalLines.reduce((sum, item) => sum + (item.debit ?? 0n), 0n);
  const credit = journalLines.reduce((sum, item) => sum + (item.credit ?? 0n), 0n);
  if (debit !== credit) throw new Error("JOURNAL_UNBALANCED");

  await client.query(
    `insert into journal_entries
       (organization_id, id, journal_date, description, currency, state, version, created_by, approved_at, approved_by, approval_reason, posted_at, posted_by)
     values ($1, $2, $3, $4, $5, 'posted', 2, $6, now(), $6, $7, now(), $6)`,
    [
      context.organizationId,
      journalId,
      journalDate,
      description,
      currency,
      context.actorId,
      reason,
    ],
  );
  for (const [index, entry] of journalLines.entries()) {
    await client.query(
      `insert into journal_lines
         (organization_id, journal_id, line_number, account_code, debit_minor, credit_minor, description, dimensions)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        context.organizationId,
        journalId,
        index + 1,
        entry.account,
        entry.debit?.toString() ?? null,
        entry.credit?.toString() ?? null,
        entry.description,
        entry.dimensions,
      ],
    );
  }
  await client.query(
    `insert into outbox_events
       (organization_id, id, aggregate_type, aggregate_id, event_type, schema_version, payload, correlation_id)
     values ($1, $2, 'journal', $3, 'journal.posted', 1, $4, $5)`,
    [context.organizationId, randomUUID(), journalId, outboxPayload, context.correlationId],
  );
}
