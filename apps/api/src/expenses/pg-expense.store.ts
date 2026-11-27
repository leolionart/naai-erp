import { Injectable } from "@nestjs/common";
import pg, { type PoolClient } from "pg";
import {
  canSelfApprove,
  resolveOrganizationWorkflowPolicy,
} from "../workflow-policy/organization-workflow-policy.service.js";
import {
  countExpenses,
  listExpenses,
  summarizeExpenses,
  type ExpenseListFilters,
  type ExpenseListPaging,
  type ExpenseSummaryGroup,
} from "./expense-list.queries.js";
import { buildFundingInferencePlan } from "./expense-plans.helper.js";
import {
  buildTaxFinalizationPlan,
  type TaxFinalizationItem,
} from "./expense-tax-finalization.helper.js";
import type { ExpenseContext } from "./expense.types.js";
import { type StoredExpense } from "./pg-expense.store.shared.js";
import {
  dryRunTaxFinalizationOperation,
  commitTaxFinalizationOperation,
} from "./expense-tax-finalization.operation.js";
import {
  dryRunFundingInferenceOperation,
  commitFundingInferenceOperation,
} from "./expense-funding-inference.operation.js";
import { updateCategoryOperation, updateMetadataOperation } from "./expense-metadata.operation.js";
import { createOperation } from "./expense-create.operation.js";
import { updateOperation } from "./expense-update.operation.js";
import {
  discardOperation,
  reviewOperation,
  transitionOperation,
} from "./expense-lifecycle.operation.js";
import { reverseReplaceOperation, reverseOperation } from "./expense-reversal.operation.js";
import {
  validateRelationshipsOperation,
  relationshipBackfillInventoryOperation,
  assertReviewReadyOperation,
} from "./expense-validation.operation.js";
import {
  ensureJournalReversedOperation,
  createFreelancePayableOperation,
  postJournalOperation,
} from "./expense-journal.operation.js";

@Injectable()
export class PgExpenseStore {
  readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  async operatingMode(c: PoolClient, organizationId: string) {
    return (await resolveOrganizationWorkflowPolicy(organizationId, c)).operatingMode;
  }

  async taxFinalizationPlan(c: PoolClient, organizationId: string) {
    const policy = await this.operatingMode(c, organizationId);
    if (policy !== "solopreneur") throw new Error("SOLOPRENEUR_POLICY_REQUIRED");
    return buildTaxFinalizationPlan(c, organizationId);
  }

  dryRunTaxFinalization = dryRunTaxFinalizationOperation;

  commitTaxFinalization = commitTaxFinalizationOperation;

  async fundingInferencePlan(c: PoolClient, org: string) {
    return buildFundingInferencePlan(c, org);
  }

  dryRunFundingInference = dryRunFundingInferenceOperation;

  commitFundingInference = commitFundingInferenceOperation;

  taxFinalizationResult(items: TaxFinalizationItem[], planHash: string, dryRun: boolean) {
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

  async fundingAccount(organizationId: string, financialAccountId: string) {
    const result = await this.pool.query<{ ledger_account_code: string; currency: string }>(
      `select ledger_account_code,currency from financial_accounts
        where organization_id=$1 and id=$2 and status='active'`,
      [organizationId, financialAccountId],
    );
    return result.rows[0];
  }

  async isSolopreneur(organizationId: string): Promise<boolean> {
    return (
      (await resolveOrganizationWorkflowPolicy(organizationId, this.pool)).operatingMode ===
      "solopreneur"
    );
  }

  async findIdByExternalReference(
    organizationId: string,
    system: string,
    externalId: string,
  ): Promise<string | undefined> {
    const result = await this.pool.query<{ expense_id: string | null }>(
      `select expense_id from external_references
        where organization_id=$1 and system=$2 and external_id=$3`,
      [organizationId, system, externalId],
    );
    return result.rows[0]?.expense_id ?? undefined;
  }

  async accountRootType(organizationId: string, code: string): Promise<string | undefined> {
    const result = await this.pool.query<{ root_type: string; is_active: boolean }>(
      `select root_type::text,is_active from accounts where organization_id=$1 and code=$2`,
      [organizationId, code],
    );
    const row = result.rows[0];
    return row?.is_active ? row.root_type : undefined;
  }

  async resolveOwnerCurrentAccount(organizationId: string, expenseDate: string) {
    const r = await this.pool.query<{ account_code: string }>(
      `select l.account_code from financial_statement_mapping_versions v join financial_statement_mapping_lines l on l.organization_id=v.organization_id and l.mapping_id=v.id and l.mapping_version=v.version join accounts a on a.organization_id=l.organization_id and a.code=l.account_code where v.organization_id=$1 and v.framework='TT133' and l.statement='balance_sheet' and l.line_code='owner_current' and a.is_active=true and v.effective_from<=$2::date and (v.effective_to is null or v.effective_to>=$2::date) order by (v.state='approved') desc,v.effective_from desc,v.version desc limit 1`,
      [organizationId, expenseDate],
    );
    return r.rows[0]?.account_code;
  }

  async resolveOwnerReceivableAccount(organizationId: string) {
    const r = await this.pool.query<{ code: string }>(
      `select code from accounts where organization_id=$1 and root_type='asset' and is_active=true and code in ('1388','1388-OWNER') order by (code='1388') desc, code asc limit 1`,
      [organizationId],
    );
    return r.rows[0]?.code;
  }

  validateRelationships = validateRelationshipsOperation;

  relationshipBackfillInventory = relationshipBackfillInventoryOperation;
  list(org: string, filters: ExpenseListFilters, paging: ExpenseListPaging) {
    return listExpenses(this.pool, org, filters, paging);
  }
  count(org: string, filters: ExpenseListFilters) {
    return countExpenses(this.pool, org, filters);
  }
  summary(org: string, filters: ExpenseListFilters, groupBy: ExpenseSummaryGroup) {
    return summarizeExpenses(this.pool, org, filters, groupBy);
  }
  async get(org: string, id: string) {
    const r = await this.pool.query(
      `select e.*,e.expense_date::text expense_date,e.paid_on::text paid_on,e.funding_financial_account_id "fundingFinancialAccountId",
       e.owner_funding_movement_id "ownerFundingId",
       (select m.bank_transaction_id from owner_funding_movements m where m.organization_id=e.organization_id and m.id=e.owner_funding_movement_id) "ownerFundingTransactionId",
       e.payment_method "paymentMethod",e.paid_on::text "paidOn",e.payment_evidence_ref "paymentEvidenceRef",
       e.transaction_evidence "transactionEvidence",e.payment_evidence_missing "paymentEvidenceMissing",
       coalesce(e.draft_reasons,'[]'::jsonb) "draftReasons",
       case when e.state='draft' then coalesce(e.draft_reasons,'[]'::jsonb) else '[]'::jsonb end reasons,
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
       coalesce(json_agg(jsonb_build_object('lineNumber',l.line_number,'description',l.description,'netMinor',l.net_minor::text,'vatMinor',l.vat_minor::text,'grossMinor',l.gross_minor::text,'postingAccountCode',l.posting_account_code,'expenseCategoryCode',l.expense_category_code,'fundingTreatment',l.funding_treatment,'vatAccountCode',l.vat_account_code,'managementState',l.management_state,'citState',l.cit_state,'vatState',l.vat_state,'citEligibleMinor',l.cit_eligible_minor::text,'vatEligibleMinor',l.vat_eligible_minor::text,'paymentEvidenceMissing',l.payment_evidence_missing,'dimensions',l.dimensions,'allocations',(select coalesce(json_agg(a order by a.allocation_number),'[]') from expense_allocations a where a.organization_id=l.organization_id and a.expense_id=l.expense_id and a.line_number=l.line_number)) order by l.line_number) filter(where l.line_number is not null),'[]') lines from expenses e left join expense_lines l on l.organization_id=e.organization_id and l.expense_id=e.id where e.organization_id=$1 and e.id=$2 group by e.organization_id,e.id`,
      [org, id],
    );
    return r.rows[0];
  }
  updateCategory = updateCategoryOperation;
  updateMetadata = updateMetadataOperation;
  create = createOperation;

  update = updateOperation;
  discard = discardOperation;
  review = reviewOperation;
  transition = transitionOperation;
  reverseReplace = reverseReplaceOperation;

  ensureJournalReversed = ensureJournalReversedOperation;

  reverse = reverseOperation;
  async lock(c: PoolClient, org: string, id: string) {
    const r = await c.query<StoredExpense>(
      `select id,expense_class,state,expense_date::text,freelance_due_date::text,currency,net_minor::text,vat_minor::text,gross_minor::text,counter_account_code,funding_financial_account_id,created_by,version::text,employee_party_id,payee_party_id,evidence_checklist from expenses where organization_id=$1 and id=$2 for update`,
      [org, id],
    );
    if (!r.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    return r.rows[0];
  }
  createFreelancePayable = createFreelancePayableOperation;
  assertReviewReady = assertReviewReadyOperation;
  async refreshSummary(c: PoolClient, org: string, id: string) {
    await c.query(
      `update expenses set cit_state=(select case when bool_or(cit_state='unreviewed') then 'unreviewed'::eligibility_state when bool_or(cit_state='accountant_override') then 'accountant_override'::eligibility_state when bool_or(cit_state='partially_eligible') or (bool_or(cit_state='eligible') and bool_or(cit_state='ineligible')) then 'partially_eligible'::eligibility_state when bool_and(cit_state='eligible') then 'eligible'::eligibility_state else 'ineligible'::eligibility_state end from expense_lines where organization_id=$1 and expense_id=$2),vat_state=(select case when bool_or(vat_state='unreviewed') then 'unreviewed'::eligibility_state when bool_or(vat_state='accountant_override') then 'accountant_override'::eligibility_state when bool_or(vat_state='partially_eligible') or (bool_or(vat_state='eligible') and bool_or(vat_state='ineligible')) then 'partially_eligible'::eligibility_state when bool_and(vat_state='eligible') then 'eligible'::eligibility_state else 'ineligible'::eligibility_state end from expense_lines where organization_id=$1 and expense_id=$2) where organization_id=$1 and id=$2`,
      [org, id],
    );
  }
  postJournal = postJournalOperation;
  async selfApproval(c: PoolClient, context: ExpenseContext, total: bigint) {
    const policy = await resolveOrganizationWorkflowPolicy(context.organizationId, c);
    if (!canSelfApprove({ policy, roles: context.roles, amountMinor: total }))
      throw new Error("MAKER_CHECKER_VIOLATION");
  }
  async period(c: PoolClient, context: ExpenseContext, date: string) {
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
  async categoryTreatment(c: PoolClient, org: string, code?: string) {
    if (!code) return null;
    const category = await c.query<{ funding_treatment: string }>(
      "select funding_treatment from expense_categories where organization_id=$1 and code=$2 and is_active=true",
      [org, code],
    );
    if (!category.rows[0]) throw new Error("EXPENSE_CATEGORY_NOT_FOUND");
    return category.rows[0].funding_treatment;
  }
  async assertOwnerPaidCounterAccount(c: PoolClient, org: string, expense: StoredExpense) {
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
         where v.organization_id=$1 and v.framework='TT133'
           and (v.state='approved' or exists(select 1 from accounting_workflow_policies w where w.organization_id=$1 and w.operating_mode='solopreneur'))
           and v.effective_from<=$3::date and (v.effective_to is null or v.effective_to>=$3::date)
           and l.statement='balance_sheet' and l.line_code='owner_current' and l.account_code=$2
       ) exists`,
      [org, expense.counter_account_code, expense.expense_date],
    );
    if (!mapped.rows[0]?.exists) throw new Error("OWNER_CURRENT_ACCOUNT_REQUIRED");
  }
  async replay(c: PoolClient, org: string, key: string, hash: string) {
    await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`${org}:${key}`]);
    const r = await c.query<{ request_hash: string; response_body: Record<string, unknown> }>(
      "select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2 for update",
      [org, key],
    );
    if (!r.rows[0]) return undefined;
    if (r.rows[0].request_hash !== hash) throw new Error("IDEMPOTENCY_CONFLICT");
    return r.rows[0].response_body;
  }
  save(
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
