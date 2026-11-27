import { createHash, randomUUID } from "node:crypto";
import { mergePaymentEvidenceFields } from "../payment-evidence/payment-input.helper.js";
import type { CreateExpenseInput, ExpenseContext } from "./expense.types.js";
import { expenseClassToTaxState } from "./pg-expense.store.shared.js";
import type { PgExpenseStore } from "./pg-expense.store.js";

export async function updateOperation(
  this: PgExpenseStore,
  context: ExpenseContext,
  id: string,
  expectedVersion: string,
  merged: CreateExpenseInput,
  key: string,
) {
  const hash = createHash("sha256")
    .update(JSON.stringify({ expectedVersion, input: merged }))
    .digest("hex");
  const c = await this.pool.connect();
  try {
    await c.query("begin");
    const replay = await this.replay(c, context.organizationId, key, hash);
    if (replay) {
      await c.query("rollback");
      return { ...replay, idempotencyReplayed: true };
    }

    const existingResult = await c.query<{ state: string; version: string }>(
      `select state, version from expenses
       where organization_id=$1 and id=$2 for update`,
      [context.organizationId, id],
    );
    const existing = existingResult.rows[0];
    if (!existing) throw new Error("RESOURCE_NOT_FOUND");
    if (existing.state !== "draft") throw new Error("INVALID_STATE_TRANSITION");
    if (existing.version.toString() !== expectedVersion) throw new Error("VERSION_CONFLICT");

    const extRefRows = await c.query<{
      system: string;
      external_id: string;
    }>(
      "select system, external_id from external_references where organization_id=$1 and expense_id=$2 for update",
      [context.organizationId, id],
    );
    const existingExtRef = extRefRows.rows[0];

    if (merged.externalReference) {
      const extRefResult = await c.query<{
        document_id: string | null;
        expense_id: string | null;
      }>(
        "select document_id, expense_id from external_references where organization_id=$1 and system=$2 and external_id=$3 for update",
        [
          context.organizationId,
          merged.externalReference.system,
          merged.externalReference.externalId,
        ],
      );
      const extRef = extRefResult.rows[0];
      if (extRef) {
        if (extRef.document_id || (extRef.expense_id && extRef.expense_id !== id)) {
          throw new Error("DUPLICATE_DOCUMENT");
        }
      }
    }

    await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `purchase-expense:${context.organizationId}:${merged.payeePartyId ?? ""}:${merged.expenseDate}:${merged.grossMinor}:${merged.currency}`,
    ]);
    const duplicateResult = await c.query<{ id: string }>(
      `select id from expenses
       where organization_id=$1 and payee_party_id is not distinct from $2 and expense_date=$3 and gross_minor=$4 and currency=$5 and id<>$6 and state<>'reversed'`,
      [
        context.organizationId,
        merged.payeePartyId ?? null,
        merged.expenseDate,
        merged.grossMinor,
        merged.currency,
        id,
      ],
    );
    if (duplicateResult.rows.length > 0) {
      throw new Error("DUPLICATE_DOCUMENT");
    }

    if (merged.payeePartyId) {
      const duplicateInvoice = await c.query<{ id: string }>(
        `select id from commercial_documents
         where organization_id=$1 and type='purchase_invoice' and party_id=$2 and document_date=$3 and gross_minor=$4 and currency=$5 and state<>'cancelled'`,
        [
          context.organizationId,
          merged.payeePartyId,
          merged.expenseDate,
          merged.grossMinor,
          merged.currency,
        ],
      );
      if (duplicateInvoice.rows.length > 0) {
        throw new Error("DUPLICATE_DOCUMENT");
      }
    }

    await c.query("delete from expense_allocations where organization_id=$1 and expense_id=$2", [
      context.organizationId,
      id,
    ]);
    await c.query("delete from expense_lines where organization_id=$1 and expense_id=$2", [
      context.organizationId,
      id,
    ]);

    if (merged.externalReference) {
      if (
        existingExtRef &&
        (existingExtRef.system !== merged.externalReference.system ||
          existingExtRef.external_id !== merged.externalReference.externalId)
      ) {
        await c.query(
          "delete from external_references where organization_id=$1 and system=$2 and external_id=$3",
          [context.organizationId, existingExtRef.system, existingExtRef.external_id],
        );
      }
      await c.query(
        `insert into external_references
         (organization_id, system, external_id, expense_id, canonical_url, checksum, version, metadata)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (organization_id, system, external_id) do update set
           expense_id=excluded.expense_id,
           canonical_url=excluded.canonical_url,
           checksum=excluded.checksum,
           version=excluded.version,
           metadata=excluded.metadata,
           synced_at=now(),
           updated_at=now()`,
        [
          context.organizationId,
          merged.externalReference.system,
          merged.externalReference.externalId,
          id,
          merged.externalReference.canonicalUrl ?? null,
          merged.externalReference.checksum ?? null,
          merged.externalReference.version ?? null,
          merged.externalReference.metadata ?? {},
        ],
      );
    }

    const newVersion = BigInt(existing.version) + 1n;
    const paymentEvidence = mergePaymentEvidenceFields(merged);
    await c.query(
      `update expenses set
        expense_class=$3, payee_party_id=$4, employee_party_id=$5, expense_date=$6,
        service_period_start=$7, service_period_end=$8, business_purpose=$9, currency=$10,
        net_minor=$11, vat_minor=$12, gross_minor=$13, counter_account_code=$14,
        funding_financial_account_id=$15, evidence_checklist=$16, version=$17,
        payment_method=$18, paid_on=$19::date, payment_evidence_ref=$20, transaction_evidence=$21,
        draft_reasons='[]'::jsonb, updated_at=now()
       where organization_id=$1 and id=$2`,
      [
        context.organizationId,
        id,
        merged.expenseClass,
        merged.payeePartyId ?? null,
        merged.employeePartyId ?? null,
        merged.expenseDate,
        merged.servicePeriodStart ?? null,
        merged.servicePeriodEnd ?? null,
        merged.businessPurpose,
        merged.currency,
        merged.netMinor,
        merged.vatMinor,
        merged.grossMinor,
        merged.counterAccountCode,
        merged.fundingFinancialAccountId ?? null,
        merged.evidenceChecklist ?? {},
        newVersion,
        paymentEvidence.paymentMethod,
        paymentEvidence.paidOn,
        paymentEvidence.paymentEvidenceRef,
        paymentEvidence.transactionEvidence,
      ],
    );

    for (const [index, line] of merged.lines.entries()) {
      const taxState = expenseClassToTaxState(
        merged.expenseClass,
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
      for (const [aIndex, a] of line.allocations.entries()) {
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
    }

    const audit = randomUUID(),
      outbox = randomUUID();
    await c.query(
      `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state) values($1,$2,'expense',$3,$4,'update',$5,$6,$7)`,
      [
        context.organizationId,
        audit,
        id,
        newVersion,
        context.actorId,
        context.correlationId,
        { state: "draft", expenseClass: merged.expenseClass },
      ],
    );
    await c.query(
      `insert into outbox_events(organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id) values($1,$2,'expense',$3,'expense.updated',1,$4,$5)`,
      [
        context.organizationId,
        outbox,
        id,
        { expenseId: id, state: "draft", expenseClass: merged.expenseClass },
        context.correlationId,
      ],
    );

    const response = {
      expenseId: id,
      state: "draft",
      resourceVersion: newVersion.toString(),
      auditEventId: audit,
      outboxEventId: outbox,
      nextActions: ["submit"],
    };
    await this.save(c, context.organizationId, key, "expense:update", hash, response);
    await c.query("commit");
    return { ...response, idempotencyReplayed: false };
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
