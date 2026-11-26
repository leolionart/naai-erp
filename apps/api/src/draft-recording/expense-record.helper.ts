import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { queryOrganizationBaseCurrency } from "../common/base-currency-guard.js";
import { applySolopreneurExpenseDefaults } from "../payment-evidence/payment-evidence-evaluator.js";
import {
  checkExpensePaymentEvidenceGate,
  checkFiscalPeriodEligibility,
  deduplicateReasons,
  isAccountActive,
} from "./draft-recording-checks.helper.js";
import { postExpenseJournalOnClient } from "./draft-recording-journals.helper.js";
import {
  makeReason,
  type DraftRecordReasonItem,
  type DraftRecordingActorContext,
} from "./draft-recording.types.js";

const ELIGIBLE_EXPENSE_STATES = new Set(["draft", "submitted", "evidence_pending", "approved"]);
const EXCLUDED_PAYMENT_GATE_CLASSES = new Set([
  "non_documented",
  "owner_personal",
  "petty_cash",
  "prepaid",
  "prepaid_asset",
  "fixed_asset",
]);

type LockedExpenseRow = {
  id: string;
  expense_class: string;
  state: string;
  expense_date: string;
  freelance_due_date: string | null;
  currency: string;
  net_minor: string;
  vat_minor: string;
  gross_minor: string;
  counter_account_code: string;
  funding_financial_account_id: string | null;
  payment_method: string;
  paid_on: string | null;
  payment_evidence_ref: string | null;
  transaction_evidence: string;
  created_by: string;
  version: string;
  employee_party_id: string | null;
  payee_party_id: string | null;
};

export type ExpenseRecordOutcome =
  | { found: false }
  | {
      found: true;
      ok: false;
      initialVersion: string;
      grossMinor: string;
      reasons: readonly DraftRecordReasonItem[];
    }
  | {
      found: true;
      ok: true;
      initialVersion: string;
      grossMinor: string;
      data: {
        expenseId: string;
        kind: "expense";
        state: "posted";
        resourceVersion: string;
        journalId: string;
        reason: string;
        selfApproved: true;
        externalReferenceUsedAsEvidence: boolean;
        paymentEvidenceMissing: boolean;
        warnings: readonly string[];
        eventId: string;
        auditEventId: string;
        outboxEventId: string;
        nextActions: readonly string[];
      };
    };

export async function recordExpenseOnClient(
  client: PoolClient,
  context: DraftRecordingActorContext,
  id: string,
  options: { reason: string; requirePaymentEvidence?: boolean },
): Promise<ExpenseRecordOutcome> {
  const locked = await client.query<LockedExpenseRow>(
    `select id, expense_class::text, state::text, expense_date::text, freelance_due_date::text,
            currency, net_minor::text, vat_minor::text, gross_minor::text,
            counter_account_code, funding_financial_account_id,
            payment_method, paid_on::text, payment_evidence_ref, transaction_evidence,
            created_by, version::text, employee_party_id, payee_party_id
       from expenses
      where organization_id = $1 and id = $2
      for update`,
    [context.organizationId, id],
  );
  const expense = locked.rows[0];
  if (!expense) return { found: false };

  const reasons: DraftRecordReasonItem[] = [];
  if (!ELIGIBLE_EXPENSE_STATES.has(expense.state)) {
    reasons.push(makeReason("INVALID_EXPENSE_TRANSITION", "state"));
  }

  const baseCurrency = await queryOrganizationBaseCurrency(client, context.organizationId);
  if (expense.currency.trim().toUpperCase() !== baseCurrency.trim().toUpperCase()) {
    reasons.push(makeReason("FOREIGN_CURRENCY_NOT_SUPPORTED", "currency"));
  }

  await checkFiscalPeriodEligibility(client, context, expense.expense_date, "expenseDate", reasons);

  const counterCode = expense.counter_account_code?.trim() ?? "";
  if (!(await isAccountActive(client, context.organizationId, counterCode))) {
    reasons.push(makeReason("COUNTER_ACCOUNT_MISSING", "counterAccountCode"));
  }

  if (expense.funding_financial_account_id) {
    const funding = await client.query<{ ledger_account_code: string }>(
      `select ledger_account_code from financial_accounts
        where organization_id = $1 and id = $2 and currency = $3 and status = 'active'
        for update`,
      [context.organizationId, expense.funding_financial_account_id, expense.currency],
    );
    if (!funding.rows[0]) {
      reasons.push(
        makeReason("EXPENSE_FUNDING_ACCOUNT_NOT_AVAILABLE", "fundingFinancialAccountId"),
      );
    } else if (funding.rows[0].ledger_account_code !== counterCode) {
      reasons.push(makeReason("EXPENSE_FUNDING_ACCOUNT_MISMATCH", "counterAccountCode"));
    }
  }

  const linesRes = await client.query<{
    line_number: number;
    description: string;
    net_minor: string;
    vat_minor: string;
    posting_account_code: string;
    vat_account_code: string | null;
    funding_treatment: string | null;
    cit_state: string;
    vat_state: string;
    vat_eligible_minor: string;
    review_reference: string | null;
    dimensions: Record<string, string>;
  }>(
    `select line_number, description, net_minor::text, vat_minor::text,
            posting_account_code, vat_account_code, funding_treatment::text,
            cit_state::text, vat_state::text, vat_eligible_minor::text,
            review_reference, dimensions
       from expense_lines
      where organization_id = $1 and expense_id = $2
      order by line_number
      for update`,
    [context.organizationId, id],
  );

  if (linesRes.rows.length === 0) {
    reasons.push(makeReason("EXPENSE_LINES_MISSING", "lines"));
  }

  if (linesRes.rows.some((line) => line.funding_treatment === "owner_paid_company_cost")) {
    const mapped = await client.query<{ exists: boolean }>(
      `select exists(
         select 1 from financial_statement_mapping_versions v
         join financial_statement_mapping_lines l
           on l.organization_id = v.organization_id and l.mapping_id = v.id and l.mapping_version = v.version
         where v.organization_id = $1 and v.framework = 'TT133'
           and (v.state = 'approved' or exists(
             select 1 from accounting_workflow_policies w
              where w.organization_id = $1 and w.operating_mode = 'solopreneur'
           ))
           and v.effective_from <= $3::date and (v.effective_to is null or v.effective_to >= $3::date)
           and l.statement = 'balance_sheet' and l.line_code = 'owner_current' and l.account_code = $2
       ) as exists`,
      [context.organizationId, counterCode, expense.expense_date],
    );
    if (!mapped.rows[0]?.exists) {
      reasons.push(makeReason("OWNER_CURRENT_ACCOUNT_REQUIRED", "counterAccountCode"));
    }
  }

  for (const line of linesRes.rows) {
    if (!(await isAccountActive(client, context.organizationId, line.posting_account_code ?? ""))) {
      reasons.push(makeReason("POSTING_ACCOUNT_MISSING", "postingAccountCode"));
    }
    if (
      BigInt(line.vat_minor) > 0n &&
      !(await isAccountActive(client, context.organizationId, line.vat_account_code ?? ""))
    ) {
      reasons.push(makeReason("VAT_ACCOUNT_MISSING", "vatAccountCode"));
    }
    const allocRes = await client.query<{ amount_minor: string }>(
      `select amount_minor::text from expense_allocations
        where organization_id = $1 and expense_id = $2 and line_number = $3`,
      [context.organizationId, id, line.line_number],
    );
    const allocated = allocRes.rows.reduce((sum, row) => sum + BigInt(row.amount_minor), 0n);
    if (allocated !== BigInt(line.net_minor)) {
      reasons.push(makeReason("EXPENSE_ALLOCATION_MISMATCH", "allocations"));
    }
  }

  if (
    expense.expense_class === "non_documented" &&
    linesRes.rows.some((line) => line.vat_state !== "ineligible" || line.vat_eligible_minor !== "0")
  ) {
    reasons.push(makeReason("VAT_EVIDENCE_REQUIRED", "vatState"));
  }

  const extRefRes = await client.query(
    `select 1 from external_references where organization_id = $1 and expense_id = $2 limit 1`,
    [context.organizationId, id],
  );
  const hasExternalRef = (extRefRes.rowCount ?? 0) > 0;
  const requiredEvidence =
    expense.expense_class === "invoice_backed"
      ? ["invoice"]
      : ["contract_backed", "freelancer"].includes(expense.expense_class)
        ? ["contract", "acceptance"]
        : [];
  let externalReferenceUsedAsEvidence = false;
  if (requiredEvidence.length > 0) {
    const evRes = await client.query<{ evidence_type: string }>(
      `select r.evidence_type
         from evidence_records r
         join evidence_versions v
           on v.organization_id = r.organization_id
          and v.evidence_id = r.id
          and v.version_number = r.current_version
        where r.organization_id = $1 and r.subject_type = 'expense' and r.subject_id = $2
          and v.status = 'active' and v.review_state = 'accepted'`,
      [context.organizationId, id],
    );
    const acceptedTypes = new Set(evRes.rows.map((row) => row.evidence_type));
    if (requiredEvidence.some((req) => !acceptedTypes.has(req))) {
      if (hasExternalRef) externalReferenceUsedAsEvidence = true;
      else reasons.push(makeReason("EXPENSE_EVIDENCE_INCOMPLETE", "externalReference"));
    }
  }

  let freelancerProjectId: string | undefined;
  if (expense.expense_class === "freelancer") {
    if (!expense.payee_party_id || !expense.freelance_due_date) {
      reasons.push(makeReason("FREELANCE_EXPENSE_RELATIONSHIPS_REQUIRED", "freelanceDueDate"));
    } else {
      const roleRes = await client.query(
        `select 1 from party_roles where organization_id = $1 and party_id = $2 and role = 'freelancer'`,
        [context.organizationId, expense.payee_party_id],
      );
      if (!roleRes.rows[0]) reasons.push(makeReason("FREELANCER_ROLE_REQUIRED", "payeePartyId"));
    }
    const projRes = await client.query<{ project_id: string }>(
      `select distinct project_id from (
         select dimensions->>'projectId' as project_id from expense_lines where organization_id = $1 and expense_id = $2
         union
         select dimensions->>'projectId' from expense_allocations where organization_id = $1 and expense_id = $2
       ) p where project_id is not null`,
      [context.organizationId, id],
    );
    if (projRes.rows.length !== 1) {
      reasons.push(makeReason("FREELANCE_EXPENSE_PROJECT_REQUIRED", "projectId"));
    } else {
      freelancerProjectId = projRes.rows[0]!.project_id;
    }
  }

  if (!EXCLUDED_PAYMENT_GATE_CLASSES.has(expense.expense_class) && linesRes.rows.length > 0) {
    await checkExpensePaymentEvidenceGate(
      client,
      context,
      expense,
      linesRes.rows,
      counterCode,
      options.requirePaymentEvidence,
      reasons,
    );
  }

  if (reasons.length > 0) {
    return {
      found: true,
      ok: false,
      initialVersion: expense.version,
      grossMinor: expense.gross_minor,
      reasons: deduplicateReasons(reasons),
    };
  }

  await applySolopreneurExpenseDefaults(client, context, id, options.reason);

  const refreshedLines = await client.query<{
    line_number: number;
    description: string;
    net_minor: string;
    vat_minor: string;
    posting_account_code: string;
    vat_account_code: string | null;
    vat_eligible_minor: string;
    payment_evidence_missing: boolean;
    dimensions: Record<string, string>;
  }>(
    `select line_number, description, net_minor::text, vat_minor::text,
            posting_account_code, vat_account_code, vat_eligible_minor::text,
            payment_evidence_missing, dimensions
       from expense_lines
      where organization_id = $1 and expense_id = $2
      order by line_number`,
    [context.organizationId, id],
  );

  const journalId = await postExpenseJournalOnClient(
    client,
    context,
    expense,
    refreshedLines.rows,
    options.reason,
  );
  if (expense.expense_class === "freelancer" && freelancerProjectId) {
    await client.query(
      `insert into project_freelance_payables
         (organization_id, id, expense_id, project_id, freelancer_party_id, due_date, amount_minor, currency, journal_id, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        context.organizationId,
        randomUUID(),
        expense.id,
        freelancerProjectId,
        expense.payee_party_id,
        expense.freelance_due_date,
        expense.gross_minor,
        expense.currency,
        journalId,
        context.actorId,
      ],
    );
  }

  const resourceVersion = (BigInt(expense.version) + 1n).toString();
  const paymentEvidenceMissing = refreshedLines.rows.some((line) => line.payment_evidence_missing);
  await client.query(
    `update expenses set
       state = 'posted', version = $3::bigint, updated_at = now(),
       approved_by = $4, approved_at = now(), posted_by = $4, posted_at = now(), journal_id = $5
     where organization_id = $1 and id = $2`,
    [context.organizationId, id, resourceVersion, context.actorId, journalId],
  );

  const eventId = randomUUID();
  const auditEventId = randomUUID();
  const outboxEventId = randomUUID();
  await client.query(
    `insert into expense_events
       (organization_id, id, expense_id, action, from_state, to_state, actor_id, reason, correlation_id, details)
     values ($1, $2, $3, 'record', $4, 'posted', $5, $6, $7, $8)`,
    [
      context.organizationId,
      eventId,
      id,
      expense.state,
      context.actorId,
      options.reason,
      context.correlationId,
      { journalId, selfApproved: true, externalReferenceUsedAsEvidence },
    ],
  );
  await client.query(
    `insert into resource_audit_events
       (organization_id, id, resource_type, resource_key, resource_version, action, actor_id, correlation_id, before_state, after_state)
     values ($1, $2, 'expense', $3, $4, 'record', $5, $6, $7, $8)`,
    [
      context.organizationId,
      auditEventId,
      id,
      resourceVersion,
      context.actorId,
      context.correlationId,
      { state: expense.state },
      {
        state: "posted",
        journalId,
        reason: options.reason,
        selfApproved: true,
        externalReferenceUsedAsEvidence,
      },
    ],
  );
  await client.query(
    `insert into outbox_events
       (organization_id, id, aggregate_type, aggregate_id, event_type, schema_version, payload, correlation_id)
     values ($1, $2, 'expense', $3, 'expense.posted', 1, $4, $5)`,
    [
      context.organizationId,
      outboxEventId,
      id,
      { expenseId: id, state: "posted", journalId },
      context.correlationId,
    ],
  );

  return {
    found: true,
    ok: true,
    initialVersion: expense.version,
    grossMinor: expense.gross_minor,
    data: {
      expenseId: id,
      kind: "expense",
      state: "posted",
      resourceVersion,
      journalId,
      reason: options.reason,
      selfApproved: true,
      externalReferenceUsedAsEvidence,
      paymentEvidenceMissing,
      warnings: paymentEvidenceMissing ? (["payment_evidence_missing"] as const) : [],
      eventId,
      auditEventId,
      outboxEventId,
      nextActions: [],
    },
  };
}
