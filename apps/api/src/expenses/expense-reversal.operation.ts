import { createHash, randomUUID } from "node:crypto";
import { mergePaymentEvidenceFields } from "../payment-evidence/payment-input.helper.js";
import type { CreateExpenseInput, ExpenseContext } from "./expense.types.js";
import { type StoredExpense, expenseClassToTaxState } from "./pg-expense.store.shared.js";
import type { PgExpenseStore } from "./pg-expense.store.js";

export async function reverseReplaceOperation(
  this: PgExpenseStore,
  context: ExpenseContext,
  id: string,
  expectedVersion: string,
  input: CreateExpenseInput,
  reason: string,
  key: string,
) {
  const hash = createHash("sha256")
    .update(JSON.stringify({ id, expectedVersion, input, reason }))
    .digest("hex");
  const c = await this.pool.connect();
  try {
    await c.query("begin");
    const replay = await this.replay(c, context.organizationId, key, hash);
    if (replay) {
      await c.query("rollback");
      return { ...replay, idempotencyReplayed: true };
    }
    const found = await c.query<StoredExpense & { journal_id: string | null }>(
      `select id,expense_class,state,expense_date::text,currency,net_minor::text,vat_minor::text,gross_minor::text,
        counter_account_code,created_by,version::text,employee_party_id,payee_party_id,evidence_checklist,journal_id
       from expenses where organization_id=$1 and id=$2 for update`,
      [context.organizationId, id],
    );
    const original = found.rows[0];
    if (!original) throw new Error("RESOURCE_NOT_FOUND");
    if (original.version !== expectedVersion) throw new Error("VERSION_CONFLICT");
    if (original.state !== "posted" || !original.journal_id)
      throw new Error("INVALID_EXPENSE_TRANSITION");
    const reconciliation = await c.query(
      `select 1 from reconciliation_allocations
        where organization_id=$1 and expense_id=$2 limit 1`,
      [context.organizationId, id],
    );
    if (reconciliation.rows[0]) throw new Error("INVALID_EXPENSE_TRANSITION");
    if ((input.id ?? "") === id) throw new Error("VALIDATION_FAILED");
    await this.period(c, context, input.expenseDate);
    const reversalJournalId = await this.ensureJournalReversed(
      c,
      context,
      original.journal_id,
      input.expenseDate,
      reason,
    );
    const replacementId = input.id ?? randomUUID();
    const paymentEvidence = mergePaymentEvidenceFields(input);
    await c.query(
      `insert into expenses(organization_id,id,expense_class,state,payee_party_id,employee_party_id,expense_date,freelance_due_date,service_period_start,service_period_end,business_purpose,currency,net_minor,vat_minor,gross_minor,counter_account_code,funding_financial_account_id,payment_method,paid_on,payment_evidence_ref,transaction_evidence,cit_state,vat_state,evidence_checklist,created_by,original_expense_id)
       values($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::date,$19,$20,'unreviewed',$21,$22,$23,$24)`,
      [
        context.organizationId,
        replacementId,
        input.expenseClass,
        input.payeePartyId ?? null,
        input.employeePartyId ?? null,
        input.expenseDate,
        input.freelanceDueDate ?? null,
        input.servicePeriodStart ?? null,
        input.servicePeriodEnd ?? null,
        input.businessPurpose,
        input.currency,
        input.netMinor,
        input.vatMinor,
        input.grossMinor,
        input.counterAccountCode,
        input.fundingFinancialAccountId ?? null,
        paymentEvidence.paymentMethod,
        paymentEvidence.paidOn,
        paymentEvidence.paymentEvidenceRef,
        paymentEvidence.transactionEvidence,
        input.expenseClass === "non_documented" ? "ineligible" : "unreviewed",
        input.evidenceChecklist ?? {},
        context.actorId,
        id,
      ],
    );
    for (const [index, line] of input.lines.entries()) {
      const taxState = expenseClassToTaxState(
        input.expenseClass,
        await this.operatingMode(c, context.organizationId),
        line.vatMinor,
      );
      const citState = line.citState ?? taxState.citState;
      const vatState = line.vatState ?? taxState.vatState;
      const fundingTreatment = await this.categoryTreatment(
        c,
        context.organizationId,
        line.expenseCategoryCode,
      );
      await c.query(
        `insert into expense_lines(organization_id,expense_id,line_number,description,net_minor,vat_minor,gross_minor,posting_account_code,expense_category_code,funding_treatment,vat_account_code,management_state,cit_state,vat_state,cit_eligible_minor,vat_eligible_minor,dimensions)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          context.organizationId,
          replacementId,
          index + 1,
          line.description,
          line.netMinor,
          line.vatMinor,
          line.grossMinor,
          line.postingAccountCode,
          line.expenseCategoryCode ?? null,
          fundingTreatment,
          line.vatAccountCode ?? null,
          line.managementState ?? taxState.managementState,
          citState,
          vatState,
          line.citEligibleMinor ?? (citState === "eligible" ? line.netMinor : "0"),
          line.vatEligibleMinor ?? (vatState === "eligible" ? line.vatMinor : "0"),
          line.dimensions ?? {},
        ],
      );
      for (const [aIndex, a] of line.allocations.entries())
        await c.query(
          `insert into expense_allocations(organization_id,expense_id,line_number,allocation_number,amount_minor,dimensions) values($1,$2,$3,$4,$5,$6)`,
          [
            context.organizationId,
            replacementId,
            index + 1,
            aIndex + 1,
            a.amountMinor,
            { ...a.dimensions, allocationId: a.id },
          ],
        );
    }
    await c.query(
      `update external_references set expense_id=$3,synced_at=now()
        where organization_id=$1 and expense_id=$2`,
      [context.organizationId, id, replacementId],
    );
    const version = (BigInt(original.version) + 1n).toString();
    await c.query(
      `update expenses set state='reversed',version=version+1,updated_at=now()
        where organization_id=$1 and id=$2`,
      [context.organizationId, id],
    );
    const audit = randomUUID();
    await c.query(
      `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
       values($1,$2,'expense',$3,$4,'reverse_replace',$5,$6,$7,$8)`,
      [
        context.organizationId,
        audit,
        id,
        version,
        context.actorId,
        context.correlationId,
        { state: "posted", journalId: original.journal_id },
        {
          state: "reversed",
          reversalJournalId,
          replacementId,
          externalReferenceTransferred: true,
          reason,
        },
      ],
    );
    const response = {
      expenseId: id,
      state: "reversed",
      resourceVersion: version,
      reversalJournalId,
      replacementExpenseId: replacementId,
      auditEventId: audit,
      nextActions: [],
    };
    await this.save(c, context.organizationId, key, "expense:reverse-replace", hash, response);
    await c.query("commit");
    return { ...response, idempotencyReplayed: false };
  } catch (error) {
    await c.query("rollback");
    throw error;
  } finally {
    c.release();
  }
}

export async function reverseOperation(
  this: PgExpenseStore,
  context: ExpenseContext,
  id: string,
  expectedVersion: string,
  reason: string,
  key: string,
) {
  const hash = createHash("sha256")
    .update(JSON.stringify({ id, expectedVersion, reason }))
    .digest("hex");
  const c = await this.pool.connect();
  try {
    await c.query("begin");
    const replay = await this.replay(c, context.organizationId, key, hash);
    if (replay) {
      await c.query("rollback");
      return { ...replay, idempotencyReplayed: true };
    }
    const found = await c.query<StoredExpense & { journal_id: string | null }>(
      `select id,expense_class,state,expense_date::text,currency,net_minor::text,vat_minor::text,gross_minor::text,
        counter_account_code,created_by,version::text,employee_party_id,payee_party_id,evidence_checklist,journal_id
       from expenses where organization_id=$1 and id=$2 for update`,
      [context.organizationId, id],
    );
    const original = found.rows[0];
    if (!original) throw new Error("RESOURCE_NOT_FOUND");
    if (original.version !== expectedVersion) throw new Error("VERSION_CONFLICT");
    if (original.state !== "posted" || !original.journal_id)
      throw new Error("INVALID_EXPENSE_TRANSITION");
    const reconciliation = await c.query(
      `select 1 from reconciliation_allocations where organization_id=$1 and expense_id=$2 limit 1`,
      [context.organizationId, id],
    );
    if (reconciliation.rows[0]) throw new Error("INVALID_EXPENSE_TRANSITION");
    await this.period(c, context, original.expense_date);
    const reversalJournalId = await this.ensureJournalReversed(
      c,
      context,
      original.journal_id,
      original.expense_date,
      reason,
    );
    const version = (BigInt(original.version) + 1n).toString();
    await c.query(
      `update expenses set state='reversed',version=version+1,updated_at=now() where organization_id=$1 and id=$2`,
      [context.organizationId, id],
    );
    const event = randomUUID(),
      audit = randomUUID(),
      outbox = randomUUID();
    await c.query(
      `insert into expense_events(organization_id,id,expense_id,action,from_state,to_state,actor_id,reason,correlation_id,details)
       values($1,$2,$3,'reverse',$4,'reversed',$5,$6,$7,$8)`,
      [
        context.organizationId,
        event,
        id,
        original.state,
        context.actorId,
        reason,
        context.correlationId,
        { reversalJournalId, journalId: original.journal_id },
      ],
    );
    await c.query(
      `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
       values($1,$2,'expense',$3,$4,'reverse',$5,$6,$7,$8)`,
      [
        context.organizationId,
        audit,
        id,
        version,
        context.actorId,
        context.correlationId,
        { state: original.state, journalId: original.journal_id },
        { state: "reversed", reversalJournalId, reason },
      ],
    );
    await c.query(
      `insert into outbox_events(organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)
       values($1,$2,'expense',$3,'expense.reversed',1,$4,$5)`,
      [
        context.organizationId,
        outbox,
        id,
        { expenseId: id, state: "reversed", reversalJournalId },
        context.correlationId,
      ],
    );
    const response = {
      expenseId: id,
      state: "reversed",
      resourceVersion: version,
      reversalJournalId,
      eventId: event,
      auditEventId: audit,
      outboxEventId: outbox,
      nextActions: [],
    };
    await this.save(c, context.organizationId, key, "expense:reverse", hash, response);
    await c.query("commit");
    return { ...response, idempotencyReplayed: false };
  } catch (error) {
    await c.query("rollback");
    throw error;
  } finally {
    c.release();
  }
}
