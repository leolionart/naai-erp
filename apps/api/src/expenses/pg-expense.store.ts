import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg, { type PoolClient } from "pg";
import type { CreateExpenseInput, ExpenseContext, ExpenseReviewInput } from "./expense.types.js";

type StoredExpense = {
  id: string;
  expense_class: string;
  state: string;
  expense_date: string;
  currency: string;
  net_minor: string;
  vat_minor: string;
  gross_minor: string;
  counter_account_code: string;
  created_by: string;
  version: string;
  employee_party_id: string | null;
  payee_party_id: string | null;
  evidence_checklist: Record<string, boolean>;
};

/**
 * Derive CIT and VAT eligibility state from expense class at insert time.
 * Tax eligibility is independent from management booking and funding source.
 * Classes without business evidence start ineligible; every other class remains
 * unreviewed until the accountant records an evidence-backed decision.
 */
function expenseClassToTaxState(expenseClass: string): { citState: string; vatState: string } {
  if (["non_documented", "owner_personal", "petty_cash"].includes(expenseClass))
    return { citState: "ineligible", vatState: "ineligible" };
  return { citState: "unreviewed", vatState: "unreviewed" };
}

const NEXT: Record<string, Record<string, string>> = {
  draft: { submit: "submitted" },
  submitted: {
    "mark-evidence-pending": "evidence_pending",
    approve: "approved",
    reject: "rejected",
  },
  evidence_pending: { submit: "submitted", reject: "rejected" },
  approved: { post: "posted" },
};

@Injectable()
export class PgExpenseStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  async list(
    org: string,
    filters: { state?: string; expenseClass?: string; payeePartyId?: string },
  ) {
    const r = await this.pool.query(
      `select e.*,e.expense_date::text expense_date from expenses e where e.organization_id=$1 and ($2::text is null or e.state::text=$2) and ($3::text is null or e.expense_class::text=$3) and ($4::text is null or e.payee_party_id=$4) order by e.expense_date desc,e.id`,
      [org, filters.state ?? null, filters.expenseClass ?? null, filters.payeePartyId ?? null],
    );
    return r.rows;
  }
  async get(org: string, id: string) {
    const r = await this.pool.query(
      `select e.*,e.expense_date::text expense_date,
       (select jsonb_build_object(
          'system', r.system,
          'externalId', r.external_id,
          'canonicalUrl', r.canonical_url,
          'checksum', r.checksum,
          'version', r.version,
          'syncedAt', r.synced_at::text,
          'metadata', r.metadata
        ) from external_references r where r.organization_id=e.organization_id and r.expense_id=e.id) as "externalReference",
       coalesce(json_agg(jsonb_build_object('lineNumber',l.line_number,'description',l.description,'netMinor',l.net_minor::text,'vatMinor',l.vat_minor::text,'grossMinor',l.gross_minor::text,'postingAccountCode',l.posting_account_code,'expenseCategoryCode',l.expense_category_code,'fundingTreatment',l.funding_treatment,'vatAccountCode',l.vat_account_code,'managementState',l.management_state,'citState',l.cit_state,'vatState',l.vat_state,'citEligibleMinor',l.cit_eligible_minor::text,'vatEligibleMinor',l.vat_eligible_minor::text,'dimensions',l.dimensions,'allocations',(select coalesce(json_agg(a order by a.allocation_number),'[]') from expense_allocations a where a.organization_id=l.organization_id and a.expense_id=l.expense_id and a.line_number=l.line_number)) order by l.line_number) filter(where l.line_number is not null),'[]') lines from expenses e left join expense_lines l on l.organization_id=e.organization_id and l.expense_id=e.id where e.organization_id=$1 and e.id=$2 group by e.organization_id,e.id`,
      [org, id],
    );
    return r.rows[0];
  }
  async create(context: ExpenseContext, input: CreateExpenseInput, key: string) {
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
              await c.query(
                "delete from expense_lines where organization_id=$1 and expense_id=$2",
                [context.organizationId, expId],
              );
              const newVersion = BigInt(exp.version) + 1n;
              await c.query(
                `update expenses set
                  expense_class=$3, payee_party_id=$4, employee_party_id=$5, expense_date=$6,
                  service_period_start=$7, service_period_end=$8, business_purpose=$9, currency=$10,
                  net_minor=$11, vat_minor=$12, gross_minor=$13, counter_account_code=$14,
                  evidence_checklist=$15, version=$16, updated_at=now()
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
                  input.evidenceChecklist ?? {},
                  newVersion,
                ],
              );
              for (const [index, line] of input.lines.entries()) {
                const taxState = expenseClassToTaxState(input.expenseClass);
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
                    line.managementState ?? "unreviewed",
                    line.citState ?? taxState.citState,
                    line.vatState ?? taxState.vatState,
                    taxState.citState === "eligible"
                      ? (line.citEligibleMinor ?? line.netMinor)
                      : (line.citEligibleMinor ?? "0"),
                    taxState.vatState === "eligible"
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
      const duplicateResult = await c.query<{ id: string }>(
        `select id from expenses
         where organization_id=$1 and payee_party_id=$2 and expense_date=$3 and gross_minor=$4 and currency=$5`,
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
           where organization_id=$1 and type='purchase_invoice' and party_id=$2 and document_date=$3 and gross_minor=$4 and currency=$5`,
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

      const id = input.id ?? randomUUID();
      await c.query(
        `insert into expenses(organization_id,id,expense_class,state,payee_party_id,employee_party_id,expense_date,service_period_start,service_period_end,business_purpose,currency,net_minor,vat_minor,gross_minor,counter_account_code,cit_state,vat_state,evidence_checklist,created_by) values($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'unreviewed',$15,$16,$17)`,
        [
          context.organizationId,
          id,
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
          input.expenseClass === "non_documented" ? "ineligible" : "unreviewed",
          input.evidenceChecklist ?? {},
          context.actorId,
        ],
      );
      for (const [index, line] of input.lines.entries()) {
        const taxState = expenseClassToTaxState(input.expenseClass);
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
            line.managementState ?? "unreviewed",
            line.citState ?? taxState.citState,
            line.vatState ?? taxState.vatState,
            taxState.citState === "eligible"
              ? (line.citEligibleMinor ?? line.netMinor)
              : (line.citEligibleMinor ?? "0"),
            taxState.vatState === "eligible"
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

      const audit = randomUUID(),
        outbox = randomUUID();
      await c.query(
        `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state) values($1,$2,'expense',$3,1,'create',$4,$5,$6)`,
        [
          context.organizationId,
          audit,
          id,
          context.actorId,
          context.correlationId,
          { state: "draft", expenseClass: input.expenseClass },
        ],
      );
      await c.query(
        `insert into outbox_events(organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id) values($1,$2,'expense',$3,'expense.created',1,$4,$5)`,
        [
          context.organizationId,
          outbox,
          id,
          { expenseId: id, state: "draft", expenseClass: input.expenseClass },
          context.correlationId,
        ],
      );
      const response = {
        expenseId: id,
        state: "draft",
        resourceVersion: "1",
        auditEventId: audit,
        outboxEventId: outbox,
        nextActions: ["submit"],
      };
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

  async update(
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

      const duplicateResult = await c.query<{ id: string }>(
        `select id from expenses
         where organization_id=$1 and payee_party_id=$2 and expense_date=$3 and gross_minor=$4 and currency=$5 and id<>$6`,
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
           where organization_id=$1 and type='purchase_invoice' and party_id=$2 and document_date=$3 and gross_minor=$4 and currency=$5`,
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
      await c.query(
        `update expenses set
          expense_class=$3, payee_party_id=$4, employee_party_id=$5, expense_date=$6,
          service_period_start=$7, service_period_end=$8, business_purpose=$9, currency=$10,
          net_minor=$11, vat_minor=$12, gross_minor=$13, counter_account_code=$14,
          evidence_checklist=$15, version=$16, updated_at=now()
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
          merged.evidenceChecklist ?? {},
          newVersion,
        ],
      );

      for (const [index, line] of merged.lines.entries()) {
        const taxState = expenseClassToTaxState(merged.expenseClass);
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
            line.managementState ?? "unreviewed",
            line.citState ?? taxState.citState,
            line.vatState ?? taxState.vatState,
            taxState.citState === "eligible"
              ? (line.citEligibleMinor ?? line.netMinor)
              : (line.citEligibleMinor ?? "0"),
            taxState.vatState === "eligible"
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
  async discard(
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
        [context.organizationId, outbox, id, { expenseId: id, reason }, context.correlationId],
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
  async review(context: ExpenseContext, id: string, input: ExpenseReviewInput, key: string) {
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
      if (["posted", "rejected"].includes(expense.state))
        throw new Error("EXPENSE_FINAL_IMMUTABLE");
      const line = await c.query<{
        gross_minor: string;
        vat_minor: string;
        management_state: string;
        cit_state: string;
        vat_state: string;
      }>(
        `select gross_minor::text,vat_minor::text,management_state,cit_state,vat_state from expense_lines where organization_id=$1 and expense_id=$2 and line_number=$3 for update`,
        [context.organizationId, id, input.lineNumber],
      );
      if (!line.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
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
      if (amountColumn) {
        await c.query(
          `update expense_lines set ${column}=$4,${amountColumn}=$5,reviewed_by=$6,reviewed_at=now(),review_reason=$7,review_reference=$8 where organization_id=$1 and expense_id=$2 and line_number=$3`,
          [
            context.organizationId,
            id,
            input.lineNumber,
            input.state,
            eligible.toString(),
            context.actorId,
            input.reason,
            input.reference ?? null,
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
      const version = (BigInt(expense.version) + 1n).toString();
      await c.query(
        "update expenses set version=version+1,updated_at=now() where organization_id=$1 and id=$2",
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
        nextActions: Object.keys(NEXT[expense.state] ?? {}),
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
  async transition(
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
          await this.selfApproval(c, context.organizationId, BigInt(e.gross_minor));
        await this.assertReviewReady(c, context.organizationId, e);
      }
      let journalId: string | undefined;
      if (action === "post") {
        await this.period(c, context, e.expense_date);
        await this.assertOwnerPaidCounterAccount(c, context.organizationId, e);
        journalId = await this.postJournal(c, context, e);
      }
      const version = (BigInt(e.version) + 1n).toString();
      await c.query(
        `update expenses set state=$3,version=version+1,updated_at=now(),approved_by=case when $4='approve' then $5 else approved_by end,approved_at=case when $4='approve' then now() else approved_at end,posted_by=case when $4='post' then $5 else posted_by end,posted_at=case when $4='post' then now() else posted_at end,journal_id=coalesce($6::text,journal_id),evidence_checklist=case when $4='mark-evidence-pending' then evidence_checklist||$7::jsonb else evidence_checklist end where organization_id=$1 and id=$2`,
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
  async reverseReplace(
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
      if ((input.id ?? "") === id) throw new Error("VALIDATION_FAILED");
      await this.period(c, context, input.expenseDate);
      const journal = await c.query<{ state: string; currency: string }>(
        `select state,currency from journal_entries where organization_id=$1 and id=$2 for update`,
        [context.organizationId, original.journal_id],
      );
      if (journal.rows[0]?.state !== "posted") throw new Error("INVALID_JOURNAL_STATE");
      const reversalJournalId = randomUUID();
      await c.query(
        `insert into journal_entries(organization_id,id,journal_date,description,currency,state,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by,reversal_of_id,version)
         values($1,$2,$3,$4,$5,'posted',$6,now(),$6,$7,now(),$6,$8,3)`,
        [
          context.organizationId,
          reversalJournalId,
          input.expenseDate,
          `Reversal of ${original.journal_id}: ${reason}`,
          journal.rows[0].currency,
          context.actorId,
          reason,
          original.journal_id,
        ],
      );
      await c.query(
        `insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)
         select organization_id,$3,line_number,account_code,credit_minor,debit_minor,description,dimensions
         from journal_lines where organization_id=$1 and journal_id=$2`,
        [context.organizationId, original.journal_id, reversalJournalId],
      );
      await c.query(
        `update journal_entries set state='reversed',version=version+1,updated_at=now() where organization_id=$1 and id=$2`,
        [context.organizationId, original.journal_id],
      );
      const replacementId = input.id ?? randomUUID();
      await c.query(
        `insert into expenses(organization_id,id,expense_class,state,payee_party_id,employee_party_id,expense_date,service_period_start,service_period_end,business_purpose,currency,net_minor,vat_minor,gross_minor,counter_account_code,cit_state,vat_state,evidence_checklist,created_by)
         values($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'unreviewed',$15,$16,$17)`,
        [
          context.organizationId,
          replacementId,
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
          input.expenseClass === "non_documented" ? "ineligible" : "unreviewed",
          input.evidenceChecklist ?? {},
          context.actorId,
        ],
      );
      for (const [index, line] of input.lines.entries()) {
        const taxState = expenseClassToTaxState(input.expenseClass);
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
            line.managementState ?? "unreviewed",
            line.citState ?? taxState.citState,
            line.vatState ?? taxState.vatState,
            line.citEligibleMinor ?? (taxState.citState === "eligible" ? line.netMinor : "0"),
            line.vatEligibleMinor ?? (taxState.vatState === "eligible" ? line.vatMinor : "0"),
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
      const version = (BigInt(original.version) + 1n).toString();
      await c.query(
        `update expenses set version=version+1,updated_at=now() where organization_id=$1 and id=$2`,
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
          { state: "posted_reversed", reversalJournalId, replacementId, reason },
        ],
      );
      const response = {
        expenseId: id,
        state: "posted",
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
  private async lock(c: PoolClient, org: string, id: string) {
    const r = await c.query<StoredExpense>(
      `select id,expense_class,state,expense_date::text,currency,net_minor::text,vat_minor::text,gross_minor::text,counter_account_code,created_by,version::text,employee_party_id,payee_party_id,evidence_checklist from expenses where organization_id=$1 and id=$2 for update`,
      [org, id],
    );
    if (!r.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    return r.rows[0];
  }
  private async assertReviewReady(c: PoolClient, organizationId: string, e: StoredExpense) {
    const r = await c.query<{
      management_state: string;
      cit_state: string;
      vat_state: string;
      vat_eligible_minor: string;
    }>(
      "select management_state,cit_state,vat_state,vat_eligible_minor::text from expense_lines where organization_id=$1 and expense_id=$2",
      [organizationId, e.id],
    );
    if (
      r.rows.length === 0 ||
      r.rows.some(
        (line) =>
          !["valid", "accountant_override"].includes(line.management_state) ||
          line.cit_state === "unreviewed" ||
          line.vat_state === "unreviewed",
      )
    )
      throw new Error("EXPENSE_REVIEW_INCOMPLETE");
    if (
      e.expense_class === "non_documented" &&
      r.rows.some((line) => line.vat_state !== "ineligible" || line.vat_eligible_minor !== "0")
    )
      throw new Error("VAT_EVIDENCE_REQUIRED");
    const required =
      e.expense_class === "invoice_backed"
        ? ["invoice"]
        : ["contract_backed", "freelancer"].includes(e.expense_class)
          ? ["contract", "acceptance"]
          : [];
    if (required.length > 0) {
      const evidence = await c.query<{ evidence_type: string }>(
        `select r.evidence_type from evidence_records r join evidence_versions v
         on v.organization_id=r.organization_id and v.evidence_id=r.id and v.version_number=r.current_version
         where r.organization_id=$1 and r.subject_type='expense' and r.subject_id=$2
           and v.status='active' and v.review_state='accepted'`,
        [organizationId, e.id],
      );
      const types = new Set(evidence.rows.map((row) => row.evidence_type));
      if (required.some((name) => !types.has(name))) throw new Error("EXPENSE_EVIDENCE_INCOMPLETE");
    }
  }
  private async refreshSummary(c: PoolClient, org: string, id: string) {
    await c.query(
      `update expenses set cit_state=(select case when bool_or(cit_state='unreviewed') then 'unreviewed'::eligibility_state when bool_or(cit_state='accountant_override') then 'accountant_override'::eligibility_state when bool_or(cit_state='partially_eligible') or (bool_or(cit_state='eligible') and bool_or(cit_state='ineligible')) then 'partially_eligible'::eligibility_state when bool_and(cit_state='eligible') then 'eligible'::eligibility_state else 'ineligible'::eligibility_state end from expense_lines where organization_id=$1 and expense_id=$2),vat_state=(select case when bool_or(vat_state='unreviewed') then 'unreviewed'::eligibility_state when bool_or(vat_state='accountant_override') then 'accountant_override'::eligibility_state when bool_or(vat_state='partially_eligible') or (bool_or(vat_state='eligible') and bool_or(vat_state='ineligible')) then 'partially_eligible'::eligibility_state when bool_and(vat_state='eligible') then 'eligible'::eligibility_state else 'ineligible'::eligibility_state end from expense_lines where organization_id=$1 and expense_id=$2) where organization_id=$1 and id=$2`,
      [org, id],
    );
  }
  private async postJournal(c: PoolClient, context: ExpenseContext, e: StoredExpense) {
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
  private async selfApproval(c: PoolClient, org: string, total: bigint) {
    const p = await c.query<{
      allow_self_approval: boolean;
      self_approval_max_minor: string | null;
    }>(
      "select allow_self_approval,self_approval_max_minor from accounting_workflow_policies where organization_id=$1",
      [org],
    );
    if (
      !p.rows[0]?.allow_self_approval ||
      total > BigInt(p.rows[0].self_approval_max_minor ?? "-1")
    )
      throw new Error("MAKER_CHECKER_VIOLATION");
  }
  private async period(c: PoolClient, context: ExpenseContext, date: string) {
    const p = await c.query<{ state: string }>(
      "select state from fiscal_periods where organization_id=$1 and $2::date between starts_on and ends_on",
      [context.organizationId, date],
    );
    if (p.rows.length !== 1)
      throw new Error(p.rows.length ? "FISCAL_PERIOD_AMBIGUOUS" : "FISCAL_PERIOD_NOT_FOUND");
    if (p.rows[0]!.state === "hard_locked") throw new Error("PERIOD_HARD_LOCKED");
    if (
      p.rows[0]!.state === "soft_locked" &&
      !context.roles.some((r) => ["owner", "finance_admin"].includes(r))
    )
      throw new Error("PERIOD_SOFT_LOCKED");
  }
  private async categoryTreatment(c: PoolClient, org: string, code?: string) {
    if (!code) return null;
    const category = await c.query<{ funding_treatment: string }>(
      "select funding_treatment from expense_categories where organization_id=$1 and code=$2 and is_active=true",
      [org, code],
    );
    if (!category.rows[0]) throw new Error("EXPENSE_CATEGORY_NOT_FOUND");
    return category.rows[0].funding_treatment;
  }
  private async assertOwnerPaidCounterAccount(c: PoolClient, org: string, expense: StoredExpense) {
    const ownerPaid = await c.query<{ exists: boolean }>(
      "select exists(select 1 from expense_lines where organization_id=$1 and expense_id=$2 and funding_treatment='owner_paid_company_cost') exists",
      [org, expense.id],
    );
    if (!ownerPaid.rows[0]?.exists) return;
    const mapped = await c.query<{ exists: boolean }>(
      `select exists(
         select 1 from financial_statement_mapping_versions v
         join financial_statement_mapping_lines l
           on l.organization_id=v.organization_id and l.mapping_id=v.id and l.mapping_version=v.version
         where v.organization_id=$1 and v.state='approved' and v.framework='TT133'
           and v.effective_from<=$3::date and (v.effective_to is null or v.effective_to>=$3::date)
           and l.statement='balance_sheet' and l.line_code='owner_current' and l.account_code=$2
       ) exists`,
      [org, expense.counter_account_code, expense.expense_date],
    );
    if (!mapped.rows[0]?.exists) throw new Error("OWNER_CURRENT_ACCOUNT_REQUIRED");
  }
  private async replay(c: PoolClient, org: string, key: string, hash: string) {
    await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`${org}:${key}`]);
    const r = await c.query<{ request_hash: string; response_body: Record<string, unknown> }>(
      "select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2 for update",
      [org, key],
    );
    if (!r.rows[0]) return undefined;
    if (r.rows[0].request_hash !== hash) throw new Error("IDEMPOTENCY_CONFLICT");
    return r.rows[0].response_body;
  }
  private save(
    c: PoolClient,
    org: string,
    key: string,
    operation: string,
    hash: string,
    response: unknown,
  ) {
    return c.query(
      "insert into api_idempotency_records(organization_id,idempotency_key,operation,request_hash,response_body) values($1,$2,$3,$4,$5)",
      [org, key, operation, hash, response],
    );
  }
}
