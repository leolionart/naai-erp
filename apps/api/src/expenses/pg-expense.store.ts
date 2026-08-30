import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg, { type PoolClient } from "pg";
import {
  canSelfApprove,
  resolveOrganizationWorkflowPolicy,
} from "../workflow-policy/organization-workflow-policy.service.js";
import type {
  CreateExpenseInput,
  ExpenseContext,
  ExpenseMetadataInput,
  ExpenseReviewInput,
} from "./expense.types.js";

type StoredExpense = {
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
  created_by: string;
  version: string;
  employee_party_id: string | null;
  payee_party_id: string | null;
  evidence_checklist: Record<string, boolean>;
};

type TaxFinalizationItem = {
  sourceType: "expense" | "purchase_invoice";
  sourceId: string;
  lineNumber: number;
  priorManagementState: string;
  priorCitState: string;
  priorVatState: string;
  managementState: string;
  citState: string;
  citEligibleMinor: string;
  vatState: string;
  vatEligibleMinor: string;
  netMinor: string;
  vatMinor: string;
};

/**
 * Derive CIT and VAT eligibility state from expense class at insert time.
 * Tax eligibility is independent from management booking and funding source.
 * Classes without business evidence start ineligible; every other class remains
 * unreviewed until the accountant records an evidence-backed decision.
 */
function expenseClassToTaxState(
  expenseClass: string,
  operatingMode: string | null,
  vatMinor: string,
): { managementState: string; citState: string; vatState: string } {
  if (["non_documented", "owner_personal", "petty_cash"].includes(expenseClass))
    return { managementState: "invalid", citState: "ineligible", vatState: "ineligible" };
  if (operatingMode === "solopreneur")
    return {
      managementState: "valid",
      citState: "unreviewed",
      vatState: BigInt(vatMinor) > 0n ? "unreviewed" : "ineligible",
    };
  return { managementState: "unreviewed", citState: "unreviewed", vatState: "unreviewed" };
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

  private async operatingMode(c: PoolClient, organizationId: string) {
    return (await resolveOrganizationWorkflowPolicy(organizationId, c)).operatingMode;
  }

  private async taxFinalizationPlan(c: PoolClient, organizationId: string) {
    const policy = await this.operatingMode(c, organizationId);
    if (policy !== "solopreneur") throw new Error("SOLOPRENEUR_POLICY_REQUIRED");
    const rows = await c.query<{
      source_type: "expense" | "purchase_invoice";
      source_id: string;
      line_number: number;
      management_state: string;
      cit_state: string;
      vat_state: string;
      net_minor: string;
      tax_minor: string;
      primary_account_code: string;
      vat_account_code: string | null;
      expense_class: string | null;
      journal_id: string;
      root_type: string | null;
      dimensions: Record<string, string> | null;
      allocation_tax: Record<string, string>[] | null;
    }>(
      `
      select 'expense'::text source_type,e.id source_id,l.line_number,l.management_state::text,l.cit_state::text,l.vat_state::text,
             l.net_minor::text,l.vat_minor::text tax_minor,l.posting_account_code primary_account_code,
             l.vat_account_code,e.expense_class::text,e.journal_id,a.root_type::text,l.dimensions,
             null::jsonb allocation_tax
        from expenses e join expense_lines l on l.organization_id=e.organization_id and l.expense_id=e.id
        left join accounts a on a.organization_id=l.organization_id and a.code=l.posting_account_code
       where e.organization_id=$1 and e.state='posted'
         and (l.management_state='unreviewed' or l.cit_state='unreviewed' or l.vat_state='unreviewed')
      union all
      select 'purchase_invoice',d.id,l.line_number,l.management_state::text,l.cit_state::text,l.vat_state::text,
             l.net_minor::text,l.tax_minor::text,l.primary_account_code,l.tax_account_code,null,d.journal_id,
             a.root_type::text,l.dimensions,
             coalesce((select jsonb_agg(x.dimensions order by x.allocation_number)
                         from commercial_document_allocations x
                        where x.organization_id=l.organization_id and x.document_id=l.document_id
                          and x.line_number=l.line_number),'[]'::jsonb)
        from commercial_documents d join commercial_document_lines l
          on l.organization_id=d.organization_id and l.document_id=d.id
        left join accounts a on a.organization_id=l.organization_id and a.code=l.primary_account_code
       where d.organization_id=$1 and d.type='purchase_invoice' and d.state in ('posted','partially_paid','paid')
         and (l.management_state='unreviewed' or l.cit_state='unreviewed' or l.vat_state='unreviewed')
       order by source_type,source_id,line_number`,
      [organizationId],
    );
    const items: TaxFinalizationItem[] = [];
    for (const row of rows.rows) {
      const excludedClass =
        row.source_type === "expense" &&
        [
          "non_documented",
          "owner_personal",
          "petty_cash",
          "prepaid",
          "prepaid_asset",
          "fixed_asset",
        ].includes(row.expense_class ?? "");
      const citEligible = !excludedClass && row.root_type !== "asset";
      const managementState =
        row.source_type === "expense" &&
        ["non_documented", "owner_personal", "petty_cash"].includes(row.expense_class ?? "")
          ? "invalid"
          : "valid";
      let explicitVatMinor = 0n;
      let explicitVatSeen = false;
      for (const dimensions of row.allocation_tax ?? []) {
        if (dimensions.taxState !== undefined) explicitVatSeen = true;
        if (["eligible", "accountant_override"].includes(dimensions.taxState ?? ""))
          explicitVatMinor = BigInt(row.tax_minor);
        else if (dimensions.taxState === "partially_eligible")
          explicitVatMinor += BigInt(dimensions.vatEligibleMinor ?? "0");
      }
      const journalVat =
        row.vat_account_code && BigInt(row.tax_minor) > 0n
          ? await c.query<{ debit: string }>(
              `select coalesce(sum(debit_minor),0)::text debit from journal_lines
              where organization_id=$1 and journal_id=$2 and account_code=$3`,
              [organizationId, row.journal_id, row.vat_account_code],
            )
          : { rows: [{ debit: "0" }] };
      const journalEligible = BigInt(journalVat.rows[0]?.debit ?? "0") >= BigInt(row.tax_minor);
      const vatEligibleMinor =
        row.source_type === "purchase_invoice" && explicitVatSeen
          ? explicitVatMinor > BigInt(row.tax_minor)
            ? BigInt(row.tax_minor)
            : explicitVatMinor
          : journalEligible
            ? BigInt(row.tax_minor)
            : 0n;
      items.push({
        sourceType: row.source_type,
        sourceId: row.source_id,
        lineNumber: row.line_number,
        priorCitState: row.cit_state,
        priorVatState: row.vat_state,
        priorManagementState: row.management_state,
        managementState,
        citState: citEligible ? "eligible" : "ineligible",
        citEligibleMinor: citEligible ? row.net_minor : "0",
        vatState:
          vatEligibleMinor === 0n
            ? "ineligible"
            : vatEligibleMinor === BigInt(row.tax_minor)
              ? "eligible"
              : "partially_eligible",
        vatEligibleMinor: vatEligibleMinor.toString(),
        netMinor: row.net_minor,
        vatMinor: row.tax_minor,
      });
    }
    return items;
  }

  async dryRunTaxFinalization(context: ExpenseContext, reason: string) {
    const c = await this.pool.connect();
    try {
      await c.query("begin isolation level repeatable read");
      const items = await this.taxFinalizationPlan(c, context.organizationId);
      const planHash = createHash("sha256").update(JSON.stringify({ reason, items })).digest("hex");
      await c.query("rollback");
      return this.taxFinalizationResult(items, planHash, true);
    } finally {
      c.release();
    }
  }

  async commitTaxFinalization(
    context: ExpenseContext,
    reason: string,
    planHash: string,
    key: string,
  ) {
    const hash = createHash("sha256").update(JSON.stringify({ reason, planHash })).digest("hex");
    const c = await this.pool.connect();
    try {
      await c.query("begin");
      const replay = await this.replay(c, context.organizationId, key, hash);
      if (replay) {
        await c.query("rollback");
        return { ...replay, idempotencyReplayed: true };
      }
      const items = await this.taxFinalizationPlan(c, context.organizationId);
      const currentHash = createHash("sha256")
        .update(JSON.stringify({ reason, items }))
        .digest("hex");
      if (currentHash !== planHash) throw new Error("TAX_FINALIZATION_PLAN_MISMATCH");
      await c.query("select set_config('app.tax_finalization','on',true)");
      for (const item of items) {
        const table = item.sourceType === "expense" ? "expense_lines" : "commercial_document_lines";
        const idColumn = item.sourceType === "expense" ? "expense_id" : "document_id";
        await c.query(
          `update ${table} set
             management_state=case when management_state='unreviewed' then $4::management_validity_state else management_state end,
             cit_state=case when cit_state='unreviewed' then $5::eligibility_state else cit_state end,
             cit_eligible_minor=case when cit_state='unreviewed' then $6 else cit_eligible_minor end,
             vat_state=case when vat_state='unreviewed' then $7::eligibility_state else vat_state end,
             vat_eligible_minor=case when vat_state='unreviewed' then $8 else vat_eligible_minor end,
             reviewed_by=$9,reviewed_at=now(),review_reason=$10,review_reference='solopreneur_policy'
           where organization_id=$1 and ${idColumn}=$2 and line_number=$3`,
          [
            context.organizationId,
            item.sourceId,
            item.lineNumber,
            item.managementState,
            item.citState,
            item.citEligibleMinor,
            item.vatState,
            item.vatEligibleMinor,
            context.actorId,
            reason,
          ],
        );
      }
      const expenseIds = [
        ...new Set(
          items.filter((item) => item.sourceType === "expense").map((item) => item.sourceId),
        ),
      ];
      for (const id of expenseIds) await this.refreshSummary(c, context.organizationId, id);
      const auditId = randomUUID();
      const result = {
        ...this.taxFinalizationResult(items, planHash, false),
        auditEventId: auditId,
        idempotencyReplayed: false,
      };
      await c.query(
        `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state)
         values($1,$2,'tax_finalization',$3,1,'commit',$4,$5,$6)`,
        [
          context.organizationId,
          auditId,
          planHash,
          context.actorId,
          context.correlationId,
          { reason, ...result },
        ],
      );
      await this.save(c, context.organizationId, key, "tax-finalization:commit", hash, result);
      await c.query("commit");
      return result;
    } catch (error) {
      await c.query("rollback");
      throw error;
    } finally {
      c.release();
    }
  }

  private async fundingInferencePlan(c: PoolClient, org: string) {
    const rows = await c.query<{
      expense_id: string;
      current_account: string | null;
      account_id: string;
      account_code: string;
      evidence_ids: string[];
      evidence_count: string;
    }>(
      `select e.id expense_id,e.funding_financial_account_id current_account,
              fa.id account_id,fa.code account_code,
              array_agg(distinct ra.id) evidence_ids,count(distinct ra.id)::text evidence_count
         from expenses e
         join reconciliation_allocations ra on ra.organization_id=e.organization_id and ra.expense_id=e.id
         join reconciliation_attempts rat on rat.organization_id=ra.organization_id and rat.id=ra.reconciliation_id
         join payment_reconciliations pr on pr.organization_id=rat.organization_id and pr.id=rat.reconciliation_id and pr.direction='payment'
         join bank_transactions bt on bt.organization_id=rat.organization_id and bt.id=rat.bank_transaction_id
         join financial_accounts fa on fa.organization_id=bt.organization_id and fa.id=bt.financial_account_id
        where e.organization_id=$1 and e.state='posted' and rat.state='reconciled'
        group by e.id,e.funding_financial_account_id,fa.id,fa.code
        order by e.id,fa.id`,
      [org],
    );
    const grouped = new Map<string, typeof rows.rows>();
    for (const row of rows.rows)
      grouped.set(row.expense_id, [...(grouped.get(row.expense_id) ?? []), row]);
    const items: Record<string, unknown>[] = [];
    const unresolved: Record<string, unknown>[] = [];
    const all = await c.query<{ id: string; funding_financial_account_id: string | null }>(
      `select id,funding_financial_account_id from expenses where organization_id=$1 and state='posted'`,
      [org],
    );
    for (const expense of all.rows) {
      if (expense.funding_financial_account_id) continue;
      const matches = grouped.get(expense.id) ?? [];
      const accountIds = [...new Set(matches.map((m) => m.account_id))];
      if (accountIds.length === 1 && matches[0]) {
        const match = matches[0];
        items.push({
          expenseId: expense.id,
          currentFundingFinancialAccountId: null,
          suggestedFundingFinancialAccountId: match.account_id,
          accountCode: match.account_code,
          evidenceType: "reconciliation",
          evidenceIds: match.evidence_ids,
          confidence: "confirmed",
        });
      } else {
        unresolved.push({
          expenseId: expense.id,
          reason:
            matches.length === 0 ? "no_reconciled_payment_evidence" : "multiple_financial_accounts",
        });
      }
    }
    return {
      items,
      unresolved,
      counts: { assignable: items.length, unresolved: unresolved.length },
    };
  }

  async dryRunFundingInference(org: string, reason: string) {
    const c = await this.pool.connect();
    try {
      await c.query("begin isolation level repeatable read");
      const plan = await this.fundingInferencePlan(c, org);
      const planHash = createHash("sha256").update(JSON.stringify({ reason, plan })).digest("hex");
      await c.query("rollback");
      return { dryRun: true, planHash, ...plan };
    } finally {
      c.release();
    }
  }

  async commitFundingInference(
    context: ExpenseContext,
    reason: string,
    planHash: string,
    key: string,
  ) {
    const hash = createHash("sha256").update(JSON.stringify({ reason, planHash })).digest("hex");
    const c = await this.pool.connect();
    try {
      await c.query("begin");
      const replay = await this.replay(c, context.organizationId, key, hash);
      if (replay) {
        await c.query("rollback");
        return { ...replay, idempotencyReplayed: true };
      }
      const plan = await this.fundingInferencePlan(c, context.organizationId);
      const currentHash = createHash("sha256")
        .update(JSON.stringify({ reason, plan }))
        .digest("hex");
      if (currentHash !== planHash) throw new Error("FUNDING_INFERENCE_PLAN_MISMATCH");
      for (const item of plan.items as Array<{
        expenseId: string;
        suggestedFundingFinancialAccountId: string;
      }>) {
        await c.query(
          `update expenses set funding_financial_account_id=$3,updated_at=now() where organization_id=$1 and id=$2 and funding_financial_account_id is null`,
          [context.organizationId, item.expenseId, item.suggestedFundingFinancialAccountId],
        );
      }
      const auditId = randomUUID();
      const response = {
        dryRun: false,
        planHash,
        counts: plan.counts,
        updatedExpenseIds: (plan.items as Array<{ expenseId: string }>).map((x) => x.expenseId),
        auditEventId: auditId,
        idempotencyReplayed: false,
      };
      await c.query(
        `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state) values($1,$2,'expense_funding_inference',$3,1,'commit',$4,$5,$6)`,
        [
          context.organizationId,
          auditId,
          "organization",
          context.actorId,
          context.correlationId,
          response,
        ],
      );
      await this.save(c, context.organizationId, key, "expense:funding-inference", hash, response);
      await c.query("commit");
      return response;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  }

  private taxFinalizationResult(items: TaxFinalizationItem[], planHash: string, dryRun: boolean) {
    const sum = (field: "citEligibleMinor" | "vatEligibleMinor") =>
      items.reduce((total, item) => total + BigInt(item[field]), 0n).toString();
    return {
      dryRun,
      planHash,
      recordCount: new Set(items.map((x) => `${x.sourceType}:${x.sourceId}`)).size,
      lineCount: items.length,
      citEligibleMinor: sum("citEligibleMinor"),
      vatEligibleMinor: sum("vatEligibleMinor"),
      items,
    };
  }

  async validateRelationships(organizationId: string, input: CreateExpenseInput) {
    if (input.fundingFinancialAccountId) {
      const funding = await this.pool.query<{ ledger_account_code: string }>(
        `select ledger_account_code from financial_accounts
           where organization_id=$1 and id=$2 and currency=$3 and status='active'`,
        [organizationId, input.fundingFinancialAccountId, input.currency],
      );
      if (!funding.rows[0]) throw new Error("EXPENSE_FUNDING_ACCOUNT_NOT_AVAILABLE");
      if (funding.rows[0].ledger_account_code !== input.counterAccountCode)
        throw new Error("EXPENSE_FUNDING_ACCOUNT_MISMATCH");
    }
    const relationships = input.lines.flatMap((line) => {
      const lineProjectId = line.dimensions?.projectId;
      const lineContractId = line.dimensions?.contractId;
      return [
        { projectId: lineProjectId, contractId: lineContractId },
        ...line.allocations.map((allocation) => ({
          projectId: allocation.dimensions.projectId ?? lineProjectId,
          contractId: allocation.dimensions.contractId ?? lineContractId,
        })),
      ];
    });
    const unique = new Map<
      string,
      { projectId: string | undefined; contractId: string | undefined }
    >();
    for (const relationship of relationships) {
      if (!relationship.projectId && !relationship.contractId) continue;
      if (relationship.contractId && !relationship.projectId)
        throw new Error("EXPENSE_CONTRACT_PROJECT_REQUIRED");
      unique.set(`${relationship.projectId ?? ""}:${relationship.contractId ?? ""}`, relationship);
    }
    for (const { projectId, contractId } of unique.values()) {
      const project = await this.pool.query<{ state: string }>(
        "select state::text from projects where organization_id=$1 and id=$2",
        [organizationId, projectId],
      );
      if (!project.rows[0]) throw new Error("PROJECT_NOT_FOUND");
      if (project.rows[0].state === "closed") throw new Error("PROJECT_CLOSED");
      if (contractId) {
        const contract = await this.pool.query(
          "select 1 from contracts where organization_id=$1 and id=$2 and project_id=$3",
          [organizationId, contractId, projectId],
        );
        if (!contract.rows[0]) throw new Error("CONTRACT_PROJECT_MISMATCH");
      }
    }
  }

  async relationshipBackfillInventory(organizationId: string) {
    const result = await this.pool.query(
      `select e.id,e.expense_class::text "expenseClass",e.state::text,
              e.payee_party_id "payeePartyId",e.version::text "resourceVersion",
              coalesce((select jsonb_agg(distinct a.dimensions->>'projectId')
                from expense_allocations a
               where a.organization_id=e.organization_id and a.expense_id=e.id
                 and a.dimensions ? 'projectId'),'[]'::jsonb) "projectIds",
              coalesce((select jsonb_agg(distinct a.dimensions->>'contractId')
                from expense_allocations a
               where a.organization_id=e.organization_id and a.expense_id=e.id
                 and a.dimensions ? 'contractId'),'[]'::jsonb) "contractIds"
         from expenses e
        where e.organization_id=$1 and e.state='posted'
        order by e.expense_date,e.id`,
      [organizationId],
    );
    return result.rows.map((row) => ({
      ...row,
      needsPayee: !row.payeePartyId,
      needsProject: row.projectIds.length === 0,
      needsContract: row.contractIds.length === 0,
    }));
  }
  async list(
    org: string,
    filters: {
      state?: string;
      expenseClass?: string;
      payeePartyId?: string;
      fundingTreatment?: string;
      startsOn?: string;
      endsOn?: string;
    },
  ) {
    const r = await this.pool.query(
      `select e.*,e.expense_date::text expense_date,e.funding_financial_account_id "fundingFinancialAccountId",
       e.original_expense_id "originalExpenseId",
       (select r.id from expenses r where r.organization_id=e.organization_id and r.original_expense_id=e.id order by r.created_at desc limit 1) "replacementExpenseId",
       coalesce((select jsonb_agg(distinct relationship.project_id order by relationship.project_id)
         from (
           select l2.dimensions->>'projectId' project_id
             from expense_lines l2
            where l2.organization_id=e.organization_id and l2.expense_id=e.id
           union
           select a2.dimensions->>'projectId'
             from expense_allocations a2
            where a2.organization_id=e.organization_id and a2.expense_id=e.id
         ) relationship where relationship.project_id is not null),'[]'::jsonb) "projectIds",
       coalesce((select jsonb_agg(distinct relationship.contract_id order by relationship.contract_id)
         from (
           select l2.dimensions->>'contractId' contract_id
             from expense_lines l2
            where l2.organization_id=e.organization_id and l2.expense_id=e.id
           union
           select a2.dimensions->>'contractId'
             from expense_allocations a2
            where a2.organization_id=e.organization_id and a2.expense_id=e.id
         ) relationship where relationship.contract_id is not null),'[]'::jsonb) "contractIds",
       (select coalesce(l.expense_category_code,l.dimensions->>'category') from expense_lines l
        where l.organization_id=e.organization_id and l.expense_id=e.id
        order by l.line_number limit 1) category,
       coalesce((select jsonb_agg(x.value order by x.value) from (
         select distinct coalesce(l.funding_treatment,c.funding_treatment) value
           from expense_lines l
           left join expense_categories c on c.organization_id=l.organization_id
            and c.code=coalesce(l.expense_category_code,l.dimensions->>'category')
          where l.organization_id=e.organization_id and l.expense_id=e.id
            and coalesce(l.funding_treatment,c.funding_treatment) is not null
       ) x),'[]'::jsonb) "fundingTreatments"
       from expenses e where e.organization_id=$1
       and (($2::text is not null and e.state::text=$2) or ($2::text is null and e.state<>'reversed'))
       and ($3::text is null or e.expense_class::text=$3)
       and ($4::text is null or e.payee_party_id=$4)
       and ($5::text is null or exists(
         select 1 from expense_lines l
         left join expense_categories c on c.organization_id=l.organization_id
          and c.code=coalesce(l.expense_category_code,l.dimensions->>'category')
         where l.organization_id=e.organization_id and l.expense_id=e.id
           and coalesce(l.funding_treatment,c.funding_treatment)::text=$5
       )) and ($6::date is null or e.expense_date >= $6::date)
       and ($7::date is null or e.expense_date <= $7::date)
       order by e.expense_date desc,e.id`,
      [
        org,
        filters.state ?? null,
        filters.expenseClass ?? null,
        filters.payeePartyId ?? null,
        filters.fundingTreatment ?? null,
        filters.startsOn ?? null,
        filters.endsOn ?? null,
      ],
    );
    return r.rows;
  }
  async get(org: string, id: string) {
    const r = await this.pool.query(
      `select e.*,e.expense_date::text expense_date,e.funding_financial_account_id "fundingFinancialAccountId",
       e.original_expense_id "originalExpenseId",
       (select r.id from expenses r where r.organization_id=e.organization_id and r.original_expense_id=e.id order by r.created_at desc limit 1) "replacementExpenseId",
       (select coalesce(l.expense_category_code,l.dimensions->>'category') from expense_lines l
         where l.organization_id=e.organization_id and l.expense_id=e.id
         order by l.line_number limit 1) category,
       (select jsonb_build_object('system', r.system,
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
  async updateCategory(context: ExpenseContext, id: string, category: string, key: string) {
    const hash = createHash("sha256").update(JSON.stringify({ id, category })).digest("hex");
    const c = await this.pool.connect();
    try {
      await c.query("begin");
      const replay = await this.replay(c, context.organizationId, key, hash);
      if (replay) {
        await c.query("rollback");
        return { ...replay, idempotencyReplayed: true };
      }
      const expense = await c.query<{ version: string }>(
        "select version::text from expenses where organization_id=$1 and id=$2 for update",
        [context.organizationId, id],
      );
      if (!expense.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      const categoryRow = await c.query<{ source: string; funding_treatment: string | null }>(
        `select 'expense' source,funding_treatment::text from expense_categories
          where organization_id=$1 and code=$2 and is_active=true
         union all
         select 'legacy' source,null::text funding_treatment from dimension_values
          where organization_id=$1 and kind='category' and code=$2 and is_active=true
         limit 1`,
        [context.organizationId, category],
      );
      if (!categoryRow.rows[0]) throw new Error("CATEGORY_NOT_FOUND");
      const before = await c.query<{ line_number: number; category: string | null }>(
        "select line_number,coalesce(expense_category_code,dimensions->>'category') category from expense_lines where organization_id=$1 and expense_id=$2 order by line_number",
        [context.organizationId, id],
      );
      if (!before.rows.length) throw new Error("RESOURCE_NOT_FOUND");
      await c.query("select set_config('app.expense_metadata_correction','on',true)");
      if (categoryRow.rows[0].source === "expense")
        await c.query(
          "update expense_lines set expense_category_code=$3,funding_treatment=$4 where organization_id=$1 and expense_id=$2",
          [context.organizationId, id, category, categoryRow.rows[0].funding_treatment],
        );
      else
        await c.query(
          "update expense_lines set dimensions=coalesce(dimensions,'{}'::jsonb)||jsonb_build_object('category',$3::text) where organization_id=$1 and expense_id=$2",
          [context.organizationId, id, category],
        );
      const version = BigInt(expense.rows[0].version) + 1n;
      await c.query(
        "update expenses set version=$3,updated_at=now() where organization_id=$1 and id=$2",
        [context.organizationId, id, version.toString()],
      );
      const auditEventId = randomUUID();
      await c.query(
        `insert into resource_audit_events
         (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
         values($1,$2,'expense',$3,$4,'update_category',$5,$6,$7,$8)`,
        [
          context.organizationId,
          auditEventId,
          id,
          version.toString(),
          context.actorId,
          context.correlationId,
          { lines: before.rows },
          { category },
        ],
      );
      const response = { expenseId: id, category, version: version.toString(), auditEventId };
      await this.save(c, context.organizationId, key, "expense:update-category", hash, response);
      await c.query("commit");
      return { ...response, idempotencyReplayed: false };
    } catch (error) {
      await c.query("rollback");
      throw error;
    } finally {
      c.release();
    }
  }
  async updateMetadata(
    context: ExpenseContext,
    id: string,
    expectedVersion: string,
    input: ExpenseMetadataInput,
    key: string,
  ) {
    const hash = createHash("sha256")
      .update(JSON.stringify({ id, expectedVersion, input }))
      .digest("hex");
    const c = await this.pool.connect();
    try {
      await c.query("begin");
      const replay = await this.replay(c, context.organizationId, key, hash);
      if (replay) {
        await c.query("rollback");
        return { ...replay, idempotencyReplayed: true };
      }
      const expenseResult = await c.query<{
        state: string;
        version: string;
        payee_party_id: string | null;
        business_purpose: string;
        journal_id: string | null;
      }>(
        `select state::text,version::text,payee_party_id,business_purpose,journal_id
           from expenses where organization_id=$1 and id=$2 for update`,
        [context.organizationId, id],
      );
      const expense = expenseResult.rows[0];
      if (!expense) throw new Error("RESOURCE_NOT_FOUND");
      if (expense.version !== expectedVersion) throw new Error("VERSION_CONFLICT");
      if (expense.state === "reversed") throw new Error("EXPENSE_FINAL_IMMUTABLE");

      if (input.payeePartyId) {
        const payee = await c.query(
          `with recursive chain(id,path) as (
             select $2::text,array[$2::text]
             union all select l.target_party_id,c.path||l.target_party_id
               from chain c join party_merge_links l
                on l.organization_id=$1 and l.source_party_id=c.id
               where not l.target_party_id=any(c.path)
           ) select 1 from chain c join parties p
             on p.organization_id=$1 and p.id=c.id and p.status='active'
             join party_roles r on r.organization_id=p.organization_id and r.party_id=p.id and r.role='supplier'
            limit 1`,
          [context.organizationId, input.payeePartyId],
        );
        if (!payee.rows[0]) throw new Error("PAYEE_SUPPLIER_NOT_FOUND");
      }
      if (input.category) {
        const category = await c.query(
          `select 1 from dimension_values
            where organization_id=$1 and kind='category' and code=$2 and is_active=true`,
          [context.organizationId, input.category],
        );
        if (!category.rows[0]) throw new Error("CATEGORY_NOT_FOUND");
      }
      if (input.customerPartyId) {
        const customer = await c.query(
          `with recursive chain(id,path) as (
             select $2::text,array[$2::text]
             union all select l.target_party_id,c.path||l.target_party_id
               from chain c join party_merge_links l
                on l.organization_id=$1 and l.source_party_id=c.id
               where not l.target_party_id=any(c.path)
           ) select 1 from chain c join parties p
             on p.organization_id=$1 and p.id=c.id and p.status='active'
             join party_roles r on r.organization_id=p.organization_id and r.party_id=p.id and r.role='client'
            limit 1`,
          [context.organizationId, input.customerPartyId],
        );
        if (!customer.rows[0]) throw new Error("CUSTOMER_CLIENT_NOT_FOUND");
      }
      if (input.projectId) {
        const project = await c.query<{ client_party_id: string; state: string }>(
          `select client_party_id,state::text from projects
             where organization_id=$1 and id=$2 and state in ('planned','active','on_hold','completed')`,
          [context.organizationId, input.projectId],
        );
        if (!project.rows[0]) throw new Error("PROJECT_NOT_FOUND");
        const targetProject = project.rows[0];
        // A project's customer is metadata context. When the expense carries an
        // explicit customer, accept merged/aliased party IDs but reject unrelated
        // customers without mutating financial facts.
        const customerParty = input.customerPartyId;
        if (customerParty) {
          const parties = await c.query<{ source_id: string; canonical_id: string }>(
            `with recursive chain(source_id,id,path) as (
               select p.id,p.id,array[p.id] from parties p
                where p.organization_id=$1 and p.id in ($2,$3)
               union all
               select c.source_id,l.target_party_id,c.path||l.target_party_id
                 from chain c join party_merge_links l
                   on l.organization_id=$1 and l.source_party_id=c.id
                where not l.target_party_id=any(c.path)
             )
             select c.source_id,c.id canonical_id from chain c
              where not exists (
                select 1 from party_merge_links l
                 where l.organization_id=$1 and l.source_party_id=c.id
                   and not l.target_party_id=any(c.path)
              )`,
            [context.organizationId, customerParty, targetProject.client_party_id],
          );
          const customerCanonical = parties.rows.find(
            (p) => p.source_id === customerParty,
          )?.canonical_id;
          const projectCanonical = parties.rows.find(
            (p) => p.source_id === targetProject.client_party_id,
          )?.canonical_id;
          if (!customerCanonical || !projectCanonical || customerCanonical !== projectCanonical)
            throw new Error("PROJECT_CUSTOMER_MISMATCH");
        }
      }

      const lines = await c.query<{
        line_number: number;
        description: string;
        category: string | null;
      }>(
        `select line_number,description,expense_category_code category
           from expense_lines where organization_id=$1 and expense_id=$2
          order by line_number for update`,
        [context.organizationId, id],
      );
      if (!lines.rows.length) throw new Error("RESOURCE_NOT_FOUND");
      const existingLineNumbers = new Set(lines.rows.map((line) => line.line_number));
      if (input.lineDescriptions?.some((line) => !existingLineNumbers.has(line.lineNumber)))
        throw new Error("EXPENSE_LINE_NOT_FOUND");

      await c.query("select set_config('app.expense_metadata_correction','on',true)");
      if (
        Object.prototype.hasOwnProperty.call(input, "payeePartyId") ||
        Object.prototype.hasOwnProperty.call(input, "businessPurpose")
      ) {
        await c.query(
          `update expenses set
             payee_party_id=case when $3 then $4::text else payee_party_id end,
             business_purpose=case when $5 then $6::text else business_purpose end
           where organization_id=$1 and id=$2`,
          [
            context.organizationId,
            id,
            Object.prototype.hasOwnProperty.call(input, "payeePartyId"),
            input.payeePartyId ?? null,
            Object.prototype.hasOwnProperty.call(input, "businessPurpose"),
            input.businessPurpose ?? null,
          ],
        );
      }
      if (Object.prototype.hasOwnProperty.call(input, "category")) {
        const category = await c.query<{ source: string; funding_treatment: string | null }>(
          `select 'expense' source,funding_treatment::text from expense_categories
             where organization_id=$1 and code=$2 and is_active=true
           union all
           select 'legacy' source,null::text funding_treatment from dimension_values
             where organization_id=$1 and kind='category' and code=$2 and is_active=true
           limit 1`,
          [context.organizationId, input.category],
        );
        if (!category.rows[0]) throw new Error("CATEGORY_NOT_FOUND");
        if (category.rows[0].source === "expense")
          await c.query(
            `update expense_lines set expense_category_code=$3,funding_treatment=$4
              where organization_id=$1 and expense_id=$2`,
            [context.organizationId, id, input.category, category.rows[0].funding_treatment],
          );
        else
          await c.query(
            `update expense_lines set dimensions=coalesce(dimensions,'{}'::jsonb)||jsonb_build_object('category',$3::text)
              where organization_id=$1 and expense_id=$2`,
            [context.organizationId, id, input.category],
          );
      }
      if (Object.prototype.hasOwnProperty.call(input, "projectId")) {
        await c.query(
          `update expense_lines set dimensions=case
             when $3::text is null then coalesce(dimensions,'{}'::jsonb)-'projectId'
             else coalesce(dimensions,'{}'::jsonb)||jsonb_build_object('projectId',$3::text)
           end where organization_id=$1 and expense_id=$2`,
          [context.organizationId, id, input.projectId ?? null],
        );
      }
      if (Object.prototype.hasOwnProperty.call(input, "customerPartyId")) {
        await c.query(
          `update expense_lines set dimensions=case
             when $3::text is null then coalesce(dimensions,'{}'::jsonb)-'customerPartyId'
             else coalesce(dimensions,'{}'::jsonb)||jsonb_build_object('customerPartyId',$3::text)
           end where organization_id=$1 and expense_id=$2`,
          [context.organizationId, id, input.customerPartyId ?? null],
        );
      }
      for (const line of input.lineDescriptions ?? []) {
        await c.query(
          `update expense_lines set description=$4
            where organization_id=$1 and expense_id=$2 and line_number=$3`,
          [context.organizationId, id, line.lineNumber, line.description],
        );
      }

      const resourceVersion = (BigInt(expense.version) + 1n).toString();
      await c.query(
        "update expenses set version=$3,updated_at=now() where organization_id=$1 and id=$2",
        [context.organizationId, id, resourceVersion],
      );
      const auditEventId = randomUUID();
      const outboxEventId = randomUUID();
      const beforeState = {
        payeePartyId: expense.payee_party_id,
        businessPurpose: expense.business_purpose,
        journalId: expense.journal_id,
        lines: lines.rows.map((line) => ({
          lineNumber: line.line_number,
          description: line.description,
          category: line.category,
        })),
      };
      const afterState = {
        payeePartyId: Object.prototype.hasOwnProperty.call(input, "payeePartyId")
          ? (input.payeePartyId ?? null)
          : expense.payee_party_id,
        businessPurpose: input.businessPurpose ?? expense.business_purpose,
        category: Object.prototype.hasOwnProperty.call(input, "category")
          ? (input.category ?? null)
          : undefined,
        projectId: Object.prototype.hasOwnProperty.call(input, "projectId")
          ? (input.projectId ?? null)
          : undefined,
        customerPartyId: Object.prototype.hasOwnProperty.call(input, "customerPartyId")
          ? (input.customerPartyId ?? null)
          : undefined,
        lineDescriptions: input.lineDescriptions ?? [],
        journalId: expense.journal_id,
      };
      await c.query(
        `insert into resource_audit_events
         (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
         values($1,$2,'expense',$3,$4,'update_metadata',$5,$6,$7,$8)`,
        [
          context.organizationId,
          auditEventId,
          id,
          resourceVersion,
          context.actorId,
          context.correlationId,
          beforeState,
          afterState,
        ],
      );
      await c.query(
        `insert into outbox_events
         (organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)
         values($1,$2,'expense',$3,'expense.metadata_updated',1,$4,$5)`,
        [
          context.organizationId,
          outboxEventId,
          id,
          { expenseId: id, resourceVersion },
          context.correlationId,
        ],
      );
      const response = {
        expenseId: id,
        state: expense.state,
        payeePartyId: afterState.payeePartyId,
        businessPurpose: afterState.businessPurpose,
        ...(Object.prototype.hasOwnProperty.call(input, "category")
          ? { category: input.category ?? null }
          : {}),
        lineDescriptions: input.lineDescriptions ?? [],
        resourceVersion,
        journalId: expense.journal_id,
        auditEventId,
        outboxEventId,
        nextActions: Object.keys(NEXT[expense.state] ?? {}),
      };
      await this.save(c, context.organizationId, key, "expense:update-metadata", hash, response);
      await c.query("commit");
      return { ...response, idempotencyReplayed: false };
    } catch (error) {
      await c.query("rollback");
      throw error;
    } finally {
      c.release();
    }
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

      const id = input.id ?? randomUUID();
      await c.query(
        `insert into expenses(organization_id,id,expense_class,state,payee_party_id,employee_party_id,expense_date,freelance_due_date,service_period_start,service_period_end,business_purpose,currency,net_minor,vat_minor,gross_minor,counter_account_code,funding_financial_account_id,cit_state,vat_state,evidence_checklist,created_by) values($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'unreviewed',$17,$18,$19)`,
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
          input.fundingFinancialAccountId ?? null,
          input.expenseClass === "non_documented" ? "ineligible" : "unreviewed",
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
        journalId = await this.postJournal(c, context, expense);
        if (expense.expense_class === "freelancer")
          await this.createFreelancePayable(c, context, expense, journalId);
        finalState = "posted";
        resourceVersion = "4";
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

      const audit = randomUUID(),
        outbox = randomUUID();
      await c.query(
        `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state) values($1,$2,'expense',$3,$4,'create',$5,$6,$7)`,
        [
          context.organizationId,
          audit,
          id,
          resourceVersion,
          context.actorId,
          context.correlationId,
          {
            state: finalState,
            expenseClass: input.expenseClass,
            journalId,
            autoCompleted: autoComplete,
          },
        ],
      );
      await c.query(
        `insert into outbox_events(organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id) values($1,$2,'expense',$3,$4,1,$5,$6)`,
        [
          context.organizationId,
          outbox,
          id,
          autoComplete ? `expense.${finalState}` : "expense.created",
          {
            expenseId: id,
            state: finalState,
            expenseClass: input.expenseClass,
            journalId,
            autoCompleted: autoComplete,
          },
          context.correlationId,
        ],
      );
      const response = {
        expenseId: id,
        state: finalState,
        resourceVersion,
        journalId,
        auditEventId: audit,
        outboxEventId: outbox,
        nextActions: Object.keys(NEXT[finalState] ?? {}),
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
      await c.query(
        `update expenses set
          expense_class=$3, payee_party_id=$4, employee_party_id=$5, expense_date=$6,
          service_period_start=$7, service_period_end=$8, business_purpose=$9, currency=$10,
          net_minor=$11, vat_minor=$12, gross_minor=$13, counter_account_code=$14,
          funding_financial_account_id=$15, evidence_checklist=$16, version=$17, updated_at=now()
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
      await c.query("select set_config('app.tax_finalization','on',true)");
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
          await this.selfApproval(c, context, BigInt(e.gross_minor));
        await this.assertReviewReady(c, context.organizationId, e);
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
      const reconciliation = await c.query(
        `select 1 from reconciliation_allocations
          where organization_id=$1 and expense_id=$2 limit 1`,
        [context.organizationId, id],
      );
      if (reconciliation.rows[0]) throw new Error("INVALID_EXPENSE_TRANSITION");
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
        `insert into expenses(organization_id,id,expense_class,state,payee_party_id,employee_party_id,expense_date,freelance_due_date,service_period_start,service_period_end,business_purpose,currency,net_minor,vat_minor,gross_minor,counter_account_code,funding_financial_account_id,cit_state,vat_state,evidence_checklist,created_by,original_expense_id)
         values($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'unreviewed',$17,$18,$19,$20)`,
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

  async reverse(
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
          original.expense_date,
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
  private async lock(c: PoolClient, org: string, id: string) {
    const r = await c.query<StoredExpense>(
      `select id,expense_class,state,expense_date::text,freelance_due_date::text,currency,net_minor::text,vat_minor::text,gross_minor::text,counter_account_code,funding_financial_account_id,created_by,version::text,employee_party_id,payee_party_id,evidence_checklist from expenses where organization_id=$1 and id=$2 for update`,
      [org, id],
    );
    if (!r.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    return r.rows[0];
  }
  private async createFreelancePayable(
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
  private async selfApproval(c: PoolClient, context: ExpenseContext, total: bigint) {
    const policy = await resolveOrganizationWorkflowPolicy(context.organizationId, c);
    if (!canSelfApprove({ policy, roles: context.roles, amountMinor: total }))
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
