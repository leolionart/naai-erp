import { createHash, randomUUID } from "node:crypto";
import { applySolopreneurExpenseDefaults } from "../payment-evidence/payment-evidence-evaluator.js";
import type { ExpenseContext, ExpenseReviewInput } from "./expense.types.js";
import { NEXT } from "./pg-expense.store.shared.js";
import type { PgExpenseStore } from "./pg-expense.store.js";

export async function reviewOperation(
  this: PgExpenseStore,
  context: ExpenseContext,
  id: string,
  input: ExpenseReviewInput,
  key: string,
) {
  const hash = createHash("sha256").update(JSON.stringify({ id, input })).digest("hex");
  const c = await this.pool.connect();
  try {
    await c.query("begin");
    const replay = await this.replay(c, context.organizationId, key, hash);
    if (replay) {
      await c.query("rollback");
      return { ...replay, idempotencyReplayed: true };
    }
    const expense = await this.lock(c, context.organizationId, id);
    // Tax eligibility is audited metadata and may be reviewed after posting;
    // management review and rejected records remain immutable.
    if (["posted", "rejected"].includes(expense.state) && input.axis === "management")
      throw new Error("EXPENSE_FINAL_IMMUTABLE");
    if (expense.state === "rejected") throw new Error("EXPENSE_FINAL_IMMUTABLE");
    const line = await c.query<{
      gross_minor: string;
      vat_minor: string;
      management_state: string;
      cit_state: string;
      vat_state: string;
      payment_evidence_missing: boolean;
    }>(
      `select gross_minor::text,vat_minor::text,management_state,cit_state,vat_state,payment_evidence_missing from expense_lines where organization_id=$1 and expense_id=$2 and line_number=$3 for update`,
      [context.organizationId, id, input.lineNumber],
    );
    if (!line.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    if (
      line.rows[0].payment_evidence_missing &&
      input.axis !== "management" &&
      ["eligible", "partially_eligible"].includes(input.state)
    ) {
      throw new Error("PAYMENT_EVIDENCE_REQUIRED");
    }
    const eligible = BigInt(input.eligibleMinor ?? "0");
    const maximum =
      input.axis === "vat" ? BigInt(line.rows[0].vat_minor) : BigInt(line.rows[0].gross_minor);
    if (eligible < 0n || eligible > maximum) throw new Error("ELIGIBILITY_AMOUNT_INVALID");
    if (
      expense.expense_class === "non_documented" &&
      input.axis === "vat" &&
      (input.state !== "ineligible" || eligible !== 0n)
    )
      throw new Error("VAT_EVIDENCE_REQUIRED");
    const allowed =
      input.axis === "management"
        ? ["valid", "invalid", "accountant_override"]
        : ["eligible", "partially_eligible", "ineligible", "accountant_override"];
    if (!allowed.includes(input.state)) throw new Error("VALIDATION_FAILED");
    const column = input.axis === "management" ? "management_state" : `${input.axis}_state`;
    const amountColumn = input.axis === "management" ? null : `${input.axis}_eligible_minor`;
    if (["posted", "approved"].includes(expense.state)) {
      await c.query("select set_config('app.tax_finalization','on',true)");
    }
    if (amountColumn) {
      const clearMissing =
        ["accountant_override", "ineligible"].includes(input.state) &&
        (input.axis === "cit"
          ? line.rows[0].vat_state !== "unreviewed"
          : line.rows[0].cit_state !== "unreviewed");
      await c.query(
        `update expense_lines set ${column}=$4,${amountColumn}=$5,payment_evidence_missing=case when $9::boolean then false else payment_evidence_missing end,reviewed_by=$6,reviewed_at=now(),review_reason=$7,review_reference=$8 where organization_id=$1 and expense_id=$2 and line_number=$3`,
        [
          context.organizationId,
          id,
          input.lineNumber,
          input.state,
          eligible.toString(),
          context.actorId,
          input.reason,
          input.reference ?? null,
          clearMissing,
        ],
      );
    } else {
      await c.query(
        `update expense_lines set ${column}=$4,reviewed_by=$5,reviewed_at=now(),review_reason=$6,review_reference=$7 where organization_id=$1 and expense_id=$2 and line_number=$3`,
        [
          context.organizationId,
          id,
          input.lineNumber,
          input.state,
          context.actorId,
          input.reason,
          input.reference ?? null,
        ],
      );
    }
    await this.refreshSummary(c, context.organizationId, id);
    const remainingReview = await c.query<{
      cit_state: string;
      vat_state: string;
    }>(
      `select cit_state,vat_state from expense_lines
        where organization_id=$1 and expense_id=$2`,
      [context.organizationId, id],
    );
    const version = (BigInt(expense.version) + 1n).toString();
    await c.query("select set_config('app.tax_finalization','on',true)");
    await c.query(
      "update expenses set version=version+1,payment_evidence_missing=coalesce((select bool_or(payment_evidence_missing) from expense_lines where organization_id=$1 and expense_id=$2),false),updated_at=now() where organization_id=$1 and id=$2",
      [context.organizationId, id],
    );
    const event = randomUUID(),
      audit = randomUUID(),
      outbox = randomUUID();
    await c.query(
      `insert into expense_events(organization_id,id,expense_id,action,actor_id,reason,correlation_id,details) values($1,$2,$3,'review',$4,$5,$6,$7)`,
      [
        context.organizationId,
        event,
        id,
        context.actorId,
        input.reason,
        context.correlationId,
        {
          axis: input.axis,
          lineNumber: input.lineNumber,
          state: input.state,
          eligibleMinor: eligible.toString(),
          reference: input.reference ?? null,
        },
      ],
    );
    await c.query(
      `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state) values($1,$2,'expense',$3,$4,'review',$5,$6,$7,$8)`,
      [
        context.organizationId,
        audit,
        id,
        version,
        context.actorId,
        context.correlationId,
        { axis: input.axis },
        { axis: input.axis, state: input.state },
      ],
    );
    await c.query(
      `insert into outbox_events(organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id) values($1,$2,'expense',$3,'expense.reviewed',1,$4,$5)`,
      [
        context.organizationId,
        outbox,
        id,
        { expenseId: id, axis: input.axis, lineNumber: input.lineNumber, state: input.state },
        context.correlationId,
      ],
    );
    const response = {
      expenseId: id,
      state: expense.state,
      axis: input.axis,
      reviewState: input.state,
      resourceVersion: version,
      eventId: event,
      auditEventId: audit,
      outboxEventId: outbox,
      nextActions: [
        ...Object.keys(NEXT[expense.state] ?? {}),
        ...(remainingReview.rows.some((row) => row.cit_state === "unreviewed")
          ? ["review-cit"]
          : []),
        ...(remainingReview.rows.some((row) => row.vat_state === "unreviewed")
          ? ["review-vat"]
          : []),
      ],
    };
    await this.save(c, context.organizationId, key, "expense:review", hash, response);
    await c.query("commit");
    return { ...response, idempotencyReplayed: false };
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

export async function transitionOperation(
  this: PgExpenseStore,
  context: ExpenseContext,
  id: string,
  action: string,
  reason: string,
  missingEvidence: string[],
  key: string,
) {
  const hash = createHash("sha256")
    .update(JSON.stringify({ id, action, reason, missingEvidence }))
    .digest("hex");
  const c = await this.pool.connect();
  try {
    await c.query("begin");
    const replay = await this.replay(c, context.organizationId, key, hash);
    if (replay) {
      await c.query("rollback");
      return { ...replay, idempotencyReplayed: true };
    }
    const e = await this.lock(c, context.organizationId, id);
    const next = NEXT[e.state]?.[action];
    if (!next) throw new Error("INVALID_EXPENSE_TRANSITION");
    if (action === "approve") {
      if (e.created_by === context.actorId)
        await this.selfApproval(c, context, BigInt(e.gross_minor));
      // Solopreneur owners approve without a separate tax review: apply the same documented
      // defaults as the tax-finalization batch so an API/n8n draft can be approved directly.
      const solopreneurOwner =
        context.roles.includes("owner") &&
        (await this.operatingMode(c, context.organizationId)) === "solopreneur";
      if (solopreneurOwner) await applySolopreneurExpenseDefaults(c, context, id);
      await this.assertReviewReady(c, context.organizationId, e, solopreneurOwner);
    }
    let journalId: string | undefined;
    if (action === "post") {
      await this.period(c, context, e.expense_date);
      await this.assertOwnerPaidCounterAccount(c, context.organizationId, e);
      journalId = await this.postJournal(c, context, e);
      if (e.expense_class === "freelancer")
        await this.createFreelancePayable(c, context, e, journalId);
    }
    const version = (BigInt(e.version) + 1n).toString();
    await c.query(
      `update expenses set state=$3,version=version+1,updated_at=now(),draft_reasons=case when $4='post' then '[]'::jsonb else draft_reasons end,approved_by=case when $4='approve' then $5 else approved_by end,approved_at=case when $4='approve' then now() else approved_at end,posted_by=case when $4='post' then $5 else posted_by end,posted_at=case when $4='post' then now() else posted_at end,journal_id=coalesce($6::text,journal_id),evidence_checklist=case when $4='mark-evidence-pending' then evidence_checklist||$7::jsonb else evidence_checklist end where organization_id=$1 and id=$2`,
      [
        context.organizationId,
        id,
        next,
        action,
        context.actorId,
        journalId ?? null,
        Object.fromEntries(missingEvidence.map((x) => [x, false])),
      ],
    );
    const event = randomUUID(),
      audit = randomUUID(),
      outbox = randomUUID();
    await c.query(
      `insert into expense_events(organization_id,id,expense_id,action,from_state,to_state,actor_id,reason,correlation_id,details) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        context.organizationId,
        event,
        id,
        action,
        e.state,
        next,
        context.actorId,
        reason,
        context.correlationId,
        { missingEvidence, journalId: journalId ?? null },
      ],
    );
    await c.query(
      `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state) values($1,$2,'expense',$3,$4,$5,$6,$7,$8,$9)`,
      [
        context.organizationId,
        audit,
        id,
        version,
        action,
        context.actorId,
        context.correlationId,
        { state: e.state },
        { state: next, journalId: journalId ?? null },
      ],
    );
    await c.query(
      `insert into outbox_events(organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id) values($1,$2,'expense',$3,$4,1,$5,$6)`,
      [
        context.organizationId,
        outbox,
        id,
        `expense.${next}`,
        { expenseId: id, state: next, journalId: journalId ?? null },
        context.correlationId,
      ],
    );
    const response = {
      expenseId: id,
      state: next,
      resourceVersion: version,
      journalId: journalId ?? null,
      eventId: event,
      auditEventId: audit,
      outboxEventId: outbox,
      nextActions: Object.keys(NEXT[next] ?? {}),
    };
    await this.save(c, context.organizationId, key, `expense:${action}`, hash, response);
    await c.query("commit");
    return { ...response, idempotencyReplayed: false };
  } catch (err) {
    await c.query("rollback");
    throw err;
  } finally {
    c.release();
  }
}

export async function discardOperation(
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
    const expense = await this.lock(c, context.organizationId, id);
    if (expense.version !== expectedVersion) throw new Error("VERSION_CONFLICT");
    if (expense.state !== "draft") throw new Error("INVALID_STATE_TRANSITION");

    await c.query("delete from external_references where organization_id=$1 and expense_id=$2", [
      context.organizationId,
      id,
    ]);
    await c.query("delete from expense_allocations where organization_id=$1 and expense_id=$2", [
      context.organizationId,
      id,
    ]);
    await c.query("delete from expense_lines where organization_id=$1 and expense_id=$2", [
      context.organizationId,
      id,
    ]);
    await c.query("delete from expenses where organization_id=$1 and id=$2", [
      context.organizationId,
      id,
    ]);

    const audit = randomUUID();
    const outbox = randomUUID();
    await c.query(
      `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
       values($1,$2,'expense',$3,$4,'discard',$5,$6,$7,$8)`,
      [
        context.organizationId,
        audit,
        id,
        expectedVersion,
        context.actorId,
        context.correlationId,
        { state: "draft" },
        { state: "discarded", reason },
      ],
    );
    await c.query(
      `insert into outbox_events(organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)
       values($1,$2,'expense',$3,'expense.discarded',1,$4,$5)`,
      [
        context.organizationId,
        outbox,
        id,
        {
          expenseId: id,
          expenseDate: expense.expense_date,
          currency: expense.currency,
          grossMinor: expense.gross_minor,
          payeePartyId: expense.payee_party_id,
          reason,
        },
        context.correlationId,
      ],
    );
    const response = {
      expenseId: id,
      state: "discarded",
      resourceVersion: expectedVersion,
      auditEventId: audit,
      outboxEventId: outbox,
      nextActions: [],
    };
    await this.save(c, context.organizationId, key, "expense:discard", hash, response);
    await c.query("commit");
    return { ...response, idempotencyReplayed: false };
  } catch (error) {
    await c.query("rollback");
    throw error;
  } finally {
    c.release();
  }
}
