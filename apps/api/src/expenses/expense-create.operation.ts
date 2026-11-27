import { createHash, randomUUID } from "node:crypto";
import { finalizeExpenseCreateAuditAndOutbox } from "../draft-recording/auto-record-ingestion.helper.js";
import { applySolopreneurExpenseDefaults } from "../payment-evidence/payment-evidence-evaluator.js";
import { mergePaymentEvidenceFields } from "../payment-evidence/payment-input.helper.js";
import { resolveOwnerFundingTraceability } from "../owner-funding/owner-funding-traceability.js";
import type { CreateExpenseInput, ExpenseContext } from "./expense.types.js";
import { NEXT, type StoredExpense, expenseClassToTaxState } from "./pg-expense.store.shared.js";
import type { PgExpenseStore } from "./pg-expense.store.js";

export async function createOperation(
  this: PgExpenseStore,
  context: ExpenseContext,
  input: CreateExpenseInput,
  key: string,
) {
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const c = await this.pool.connect();
  try {
    await c.query("begin");
    const replay = await this.replay(c, context.organizationId, key, hash);
    if (replay) {
      await c.query("rollback");
      return { ...replay, idempotencyReplayed: true };
    }
    if (input.externalReference) {
      const extRefResult = await c.query<{
        document_id: string | null;
        expense_id: string | null;
        canonical_url: string | null;
        checksum: string | null;
        version: string | null;
        metadata: Record<string, unknown>;
      }>(
        "select document_id, expense_id, canonical_url, checksum, version, metadata from external_references where organization_id=$1 and system=$2 and external_id=$3 for update",
        [
          context.organizationId,
          input.externalReference.system,
          input.externalReference.externalId,
        ],
      );
      const extRef = extRefResult.rows[0];
      if (extRef) {
        if (extRef.document_id) {
          throw new Error("DUPLICATE_DOCUMENT");
        }
        if (extRef.expense_id) {
          const expId = extRef.expense_id;
          const expResult = await c.query<{ state: string; version: string }>(
            "select state, version from expenses where organization_id=$1 and id=$2 for update",
            [context.organizationId, expId],
          );
          const exp = expResult.rows[0];
          if (!exp) {
            throw new Error("RESOURCE_NOT_FOUND");
          }
          if (exp.state === "draft") {
            await c.query(
              "delete from expense_allocations where organization_id=$1 and expense_id=$2",
              [context.organizationId, expId],
            );
            await c.query("delete from expense_lines where organization_id=$1 and expense_id=$2", [
              context.organizationId,
              expId,
            ]);
            const newVersion = BigInt(exp.version) + 1n;
            await c.query(
              `update expenses set
                expense_class=$3, payee_party_id=$4, employee_party_id=$5, expense_date=$6,
                service_period_start=$7, service_period_end=$8, business_purpose=$9, currency=$10,
                net_minor=$11, vat_minor=$12, gross_minor=$13, counter_account_code=$14,
                funding_financial_account_id=$15, evidence_checklist=$16, version=$17, updated_at=now()
               where organization_id=$1 and id=$2`,
              [
                context.organizationId,
                expId,
                input.expenseClass,
                input.payeePartyId ?? null,
                input.employeePartyId ?? null,
                input.expenseDate,
                input.servicePeriodStart ?? null,
                input.servicePeriodEnd ?? null,
                input.businessPurpose,
                input.currency,
                input.netMinor,
                input.vatMinor,
                input.grossMinor,
                input.counterAccountCode,
                input.fundingFinancialAccountId ?? null,
                input.evidenceChecklist ?? {},
                newVersion,
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
                `insert into expense_lines(organization_id,expense_id,line_number,description,net_minor,vat_minor,gross_minor,posting_account_code,expense_category_code,funding_treatment,vat_account_code,management_state,cit_state,vat_state,cit_eligible_minor,vat_eligible_minor,dimensions) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
                [
                  context.organizationId,
                  expId,
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
                  citState === "eligible"
                    ? (line.citEligibleMinor ?? line.netMinor)
                    : (line.citEligibleMinor ?? "0"),
                  vatState === "eligible"
                    ? (line.vatEligibleMinor ?? line.vatMinor)
                    : (line.vatEligibleMinor ?? "0"),
                  line.dimensions ?? {},
                ],
              );
              for (const [aIndex, a] of line.allocations.entries()) {
                await c.query(
                  `insert into expense_allocations(organization_id,expense_id,line_number,allocation_number,amount_minor,dimensions) values($1,$2,$3,$4,$5,$6)`,
                  [
                    context.organizationId,
                    expId,
                    index + 1,
                    aIndex + 1,
                    a.amountMinor,
                    { ...a.dimensions, allocationId: a.id },
                  ],
                );
              }
            }
            await c.query(
              `update external_references set
                canonical_url=$4, checksum=$5, version=$6, synced_at=now(), metadata=$7, updated_at=now()
               where organization_id=$1 and system=$2 and external_id=$3`,
              [
                context.organizationId,
                input.externalReference.system,
                input.externalReference.externalId,
                input.externalReference.canonicalUrl ?? extRef.canonical_url,
                input.externalReference.checksum ?? extRef.checksum,
                input.externalReference.version ?? extRef.version,
                input.externalReference.metadata ?? extRef.metadata,
              ],
            );
            const audit = randomUUID(),
              outbox = randomUUID();
            await c.query(
              `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state) values($1,$2,'expense',$3,$4,'update',$5,$6,$7)`,
              [
                context.organizationId,
                audit,
                expId,
                newVersion,
                context.actorId,
                context.correlationId,
                { state: "draft", expenseClass: input.expenseClass },
              ],
            );
            await c.query(
              `insert into outbox_events(organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id) values($1,$2,'expense',$3,'expense.updated',1,$4,$5)`,
              [
                context.organizationId,
                outbox,
                expId,
                { expenseId: expId, state: "draft", expenseClass: input.expenseClass },
                context.correlationId,
              ],
            );
            const response = {
              expenseId: expId,
              state: "draft",
              resourceVersion: newVersion.toString(),
              auditEventId: audit,
              outboxEventId: outbox,
              nextActions: ["submit"],
            };
            await c.query("commit");
            return { ...response, idempotencyReplayed: true };
          } else {
            const response = {
              expenseId: expId,
              state: exp.state,
              resourceVersion: exp.version.toString(),
              auditEventId: null,
              outboxEventId: null,
              nextActions:
                exp.state === "draft"
                  ? ["submit"]
                  : exp.state === "submitted"
                    ? ["approve", "reject"]
                    : [],
            };
            await c.query("commit");
            return { ...response, idempotencyReplayed: true };
          }
        }
      }
    }

    // Duplicate checks:
    await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `purchase-expense:${context.organizationId}:${input.payeePartyId ?? ""}:${input.expenseDate}:${input.grossMinor}:${input.currency}`,
    ]);
    const duplicateResult = await c.query<{ id: string }>(
      `select id from expenses
       where organization_id=$1 and payee_party_id is not distinct from $2 and expense_date=$3 and gross_minor=$4 and currency=$5 and state<>'reversed'`,
      [
        context.organizationId,
        input.payeePartyId ?? null,
        input.expenseDate,
        input.grossMinor,
        input.currency,
      ],
    );
    if (duplicateResult.rows.length > 0) {
      throw new Error("DUPLICATE_DOCUMENT");
    }

    if (input.payeePartyId) {
      const duplicateInvoice = await c.query<{ id: string }>(
        `select id from commercial_documents
         where organization_id=$1 and type='purchase_invoice' and party_id=$2 and document_date=$3 and gross_minor=$4 and currency=$5 and state<>'cancelled'`,
        [
          context.organizationId,
          input.payeePartyId,
          input.expenseDate,
          input.grossMinor,
          input.currency,
        ],
      );
      if (duplicateInvoice.rows.length > 0) {
        throw new Error("DUPLICATE_DOCUMENT");
      }
    }

    const ownerFundingTrace = await resolveOwnerFundingTraceability(c, context.organizationId, {
      ownerFundingId: input.ownerFundingId ?? input.funding?.ownerFundingId,
      ownerFundingTransactionId:
        input.ownerFundingTransactionId ?? input.funding?.ownerFundingTransactionId,
      fundingType: input.funding?.type,
      fundingFinancialAccountId: input.fundingFinancialAccountId,
      accountCode: input.counterAccountCode,
      currency: input.currency,
    });
    const effectiveFundingAccountId =
      input.fundingFinancialAccountId ?? ownerFundingTrace?.financialAccountId ?? null;
    const id = input.id ?? randomUUID();
    const paymentEvidence = mergePaymentEvidenceFields(input);
    await c.query(
      `insert into expenses(organization_id,id,expense_class,state,payee_party_id,employee_party_id,expense_date,freelance_due_date,service_period_start,service_period_end,business_purpose,currency,net_minor,vat_minor,gross_minor,counter_account_code,funding_financial_account_id,owner_funding_movement_id,payment_method,paid_on,payment_evidence_ref,transaction_evidence,cit_state,vat_state,evidence_checklist,created_by) values($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::date,$20,$21,'unreviewed',$22,$23,$24)`,
      [
        context.organizationId,
        id,
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
        effectiveFundingAccountId,
        ownerFundingTrace?.movementId ?? null,
        paymentEvidence.paymentMethod,
        paymentEvidence.paidOn,
        paymentEvidence.paymentEvidenceRef,
        paymentEvidence.transactionEvidence,
        ["non_documented", "owner_personal", "petty_cash"].includes(input.expenseClass)
          ? "ineligible"
          : "unreviewed",
        input.evidenceChecklist ?? {},
        context.actorId,
      ],
    );
    const operatingMode = await this.operatingMode(c, context.organizationId);
    for (const [index, line] of input.lines.entries()) {
      const taxState = expenseClassToTaxState(input.expenseClass, operatingMode, line.vatMinor);
      const citState = line.citState ?? taxState.citState;
      const vatState = line.vatState ?? taxState.vatState;
      const fundingTreatment = await this.categoryTreatment(
        c,
        context.organizationId,
        line.expenseCategoryCode,
      );
      await c.query(
        `insert into expense_lines(organization_id,expense_id,line_number,description,net_minor,vat_minor,gross_minor,posting_account_code,expense_category_code,funding_treatment,vat_account_code,management_state,cit_state,vat_state,cit_eligible_minor,vat_eligible_minor,dimensions) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          context.organizationId,
          id,
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
          citState === "eligible"
            ? (line.citEligibleMinor ?? line.netMinor)
            : (line.citEligibleMinor ?? "0"),
          vatState === "eligible"
            ? (line.vatEligibleMinor ?? line.vatMinor)
            : (line.vatEligibleMinor ?? "0"),
          line.dimensions ?? {},
        ],
      );
      for (const [aIndex, a] of line.allocations.entries())
        await c.query(
          `insert into expense_allocations(organization_id,expense_id,line_number,allocation_number,amount_minor,dimensions) values($1,$2,$3,$4,$5,$6)`,
          [
            context.organizationId,
            id,
            index + 1,
            aIndex + 1,
            a.amountMinor,
            { ...a.dimensions, allocationId: a.id },
          ],
        );
    }

    if (input.externalReference) {
      await c.query(
        `insert into external_references
         (organization_id, system, external_id, expense_id, canonical_url, checksum, version, metadata)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          context.organizationId,
          input.externalReference.system,
          input.externalReference.externalId,
          id,
          input.externalReference.canonicalUrl ?? null,
          input.externalReference.checksum ?? null,
          input.externalReference.version ?? null,
          input.externalReference.metadata ?? {},
        ],
      );
    }

    const autoComplete = operatingMode === "solopreneur" && context.roles.includes("owner");
    let finalState = "draft";
    let resourceVersion = "1";
    let journalId: string | null = null;
    if (autoComplete) {
      const expense: StoredExpense = {
        id,
        expense_class: input.expenseClass,
        state: "draft",
        expense_date: input.expenseDate,
        freelance_due_date: input.freelanceDueDate ?? null,
        currency: input.currency,
        net_minor: input.netMinor,
        vat_minor: input.vatMinor,
        gross_minor: input.grossMinor,
        counter_account_code: input.counterAccountCode,
        funding_financial_account_id: input.fundingFinancialAccountId ?? null,
        created_by: context.actorId,
        version: "1",
        employee_party_id: input.employeePartyId ?? null,
        payee_party_id: input.payeePartyId ?? null,
        evidence_checklist: { ...(input.evidenceChecklist ?? {}) },
      };
      await this.period(c, context, expense.expense_date);
      await this.assertOwnerPaidCounterAccount(c, context.organizationId, expense);
      await applySolopreneurExpenseDefaults(c, context, id, "Solopreneur save and record");
      journalId = await this.postJournal(c, context, expense);
      if (expense.expense_class === "freelancer")
        await this.createFreelancePayable(c, context, expense, journalId);
      finalState = "posted";
      resourceVersion = "4";
      await this.refreshSummary(c, context.organizationId, id);
      await c.query(
        `update expenses set state='posted',version=4,updated_at=now(),approved_by=$3,approved_at=now(),
           posted_by=$3,posted_at=now(),journal_id=$4 where organization_id=$1 and id=$2`,
        [context.organizationId, id, context.actorId, journalId],
      );
      await c.query(
        `insert into expense_events(organization_id,id,expense_id,action,from_state,to_state,actor_id,reason,correlation_id,details)
         values($1,$2,$3,'save-and-record','draft','posted',$4,'Solopreneur save and record',$5,$6)`,
        [
          context.organizationId,
          randomUUID(),
          id,
          context.actorId,
          context.correlationId,
          { journalId, autoCompleted: true },
        ],
      );
    }
    const response = await finalizeExpenseCreateAuditAndOutbox(c, context, {
      id,
      expenseClass: input.expenseClass,
      operatingMode,
      autoComplete,
      finalState,
      resourceVersion,
      journalId,
      nextActionsForState: (state) => Object.keys(NEXT[state] ?? {}),
    });
    await this.save(c, context.organizationId, key, "expense:create", hash, response);
    await c.query("commit");
    return { ...response, idempotencyReplayed: false };
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
