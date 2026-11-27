import { mergePaymentEvidenceFields } from "../payment-evidence/payment-input.helper.js";
import {
  countCommercialDocuments,
  listCommercialDocuments,
  summarizeCommercialDocuments,
  type CommercialDocumentSummaryGroup,
  type CommercialDocumentListFilters,
  type CommercialDocumentListPaging,
} from "./commercial-document-list.queries.js";
import { Injectable } from "@nestjs/common";
import pg, { type PoolClient } from "pg";
import {
  canSelfApprove,
  resolveOrganizationWorkflowPolicy,
} from "../workflow-policy/organization-workflow-policy.service.js";
import { buildPurchaseFundingReplacement } from "./document-funding.js";
import {
  assertCreditAllowedQuery,
  assertSalesContractCoverageQuery,
} from "./document-store-assertions.helper.js";
import type {
  CommercialDocumentContext,
  CommercialDocumentType,
  CreateCommercialDocumentInput,
} from "./commercial-document.types.js";
import { NEXT, type StoredDocument } from "./pg-commercial-document.store.shared.js";
import { reviewOperation, resolveTaxCodeOperation } from "./commercial-document-tax.operation.js";
import {
  insertDocumentLineOperation,
  createOperation,
} from "./commercial-document-create.operation.js";
import {
  validateRelationshipsOperation,
  postDocumentJournalOperation,
} from "./commercial-document-journal.operation.js";
import {
  updateCategoryOperation,
  updateMetadataOperation,
  reclassifyAccountsOperation,
} from "./commercial-document-metadata.operation.js";
import { deleteDraftOperation, updateOperation } from "./commercial-document-update.operation.js";
import { transitionOperation } from "./commercial-document-lifecycle.operation.js";
import {
  reverseReplaceOperation,
  ensureJournalReversedOperation,
  reverseOperation,
} from "./commercial-document-reversal.operation.js";

@Injectable()
export class PgCommercialDocumentStore {
  readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  async operatingMode(client: PoolClient, organizationId: string) {
    return (await resolveOrganizationWorkflowPolicy(organizationId, client)).operatingMode;
  }

  review = reviewOperation;

  resolveTaxCode = resolveTaxCodeOperation;

  async ownerCurrentAccount(client: PoolClient, organizationId: string, documentDate: string) {
    const result = await client.query<{ account_code: string }>(
      `with selected_mapping as (
         select id,version from financial_statement_mapping_versions
          where organization_id=$1 and framework='TT133'
            and (state='approved' or exists(select 1 from accounting_workflow_policies w where w.organization_id=$1 and w.operating_mode='solopreneur'))
            and effective_from <= $2::date and (effective_to is null or effective_to >= $2::date)
          order by (state='approved') desc,effective_from desc,version desc limit 1
       )
       select ml.account_code from selected_mapping sm
       join financial_statement_mapping_lines ml on ml.organization_id=$1 and ml.mapping_id=sm.id and ml.mapping_version=sm.version
       join accounts a on a.organization_id=ml.organization_id and a.code=ml.account_code
       where ml.statement='balance_sheet' and ml.line_code='owner_current' and a.is_active=true
       order by ml.account_code limit 2`,
      [organizationId, documentDate],
    );
    if (result.rows.length !== 1) throw new Error("OWNER_CURRENT_ACCOUNT_NOT_CONFIGURED");
    return result.rows[0]!.account_code;
  }

  insertDocumentLine = insertDocumentLineOperation;

  validateRelationships = validateRelationshipsOperation;

  async relationshipBackfillInventory(organizationId: string) {
    const result = await this.pool.query(
      `select d.id,d.type::text,d.state::text,d.document_number "documentNumber",
              d.party_id "partyId",d.version::text "resourceVersion",
              coalesce((select jsonb_agg(distinct a.dimensions->>'projectId')
                from commercial_document_allocations a
               where a.organization_id=d.organization_id and a.document_id=d.id
                 and a.dimensions ? 'projectId'),'[]'::jsonb) "projectIds",
              coalesce((select jsonb_agg(distinct a.dimensions->>'contractId')
                from commercial_document_allocations a
               where a.organization_id=d.organization_id and a.document_id=d.id
                 and a.dimensions ? 'contractId'),'[]'::jsonb) "contractIds"
         from commercial_documents d
        where d.organization_id=$1 and d.state in ('issued','posted','partially_paid','paid')
        order by d.document_date,d.id`,
      [organizationId],
    );
    return result.rows.map((row) => ({
      ...row,
      needsProject: row.type === "sales_invoice" && row.projectIds.length === 0,
      needsContract: row.type === "sales_invoice" && row.contractIds.length === 0,
    }));
  }

  updateCategory = updateCategoryOperation;

  updateMetadata = updateMetadataOperation;

  count(organizationId: string, filters: CommercialDocumentListFilters) {
    return countCommercialDocuments(this.pool, organizationId, filters);
  }

  summary(
    organizationId: string,
    filters: CommercialDocumentListFilters,
    groupBy: CommercialDocumentSummaryGroup,
  ) {
    return summarizeCommercialDocuments(this.pool, organizationId, filters, groupBy);
  }

  list(
    organizationId: string,
    filters: CommercialDocumentListFilters,
    paging: CommercialDocumentListPaging,
  ) {
    return listCommercialDocuments(this.pool, organizationId, filters, paging);
  }

  async get(organizationId: string, id: string) {
    const result = await this.pool.query(
      `select d.*,d.document_date::text document_date,d.due_date::text due_date,d.paid_on::text paid_on,
       d.payment_method "paymentMethod",d.paid_on::text "paidOn",d.payment_evidence_ref "paymentEvidenceRef",
       d.transaction_evidence "transactionEvidence",d.payment_evidence_missing "paymentEvidenceMissing",
       coalesce(d.draft_reasons,'[]'::jsonb) "draftReasons",
       case when d.state='draft' then coalesce(d.draft_reasons,'[]'::jsonb) else '[]'::jsonb end reasons,
       case when d.state='cancelled' and exists(select 1 from resource_audit_events ra where ra.organization_id=d.organization_id and ra.resource_type='commercial_document' and ra.resource_key=d.id and ra.action='reverse_replace') then 'corrected' when exists(select 1 from resource_audit_events ra where ra.organization_id=d.organization_id and ra.resource_type='commercial_document' and ra.action='reverse_replace' and ra.after_state->>'replacementId'=d.id) then 'replacement' else null end correction_status,
       (select ra.after_state->>'replacementId' from resource_audit_events ra where ra.organization_id=d.organization_id and ra.resource_type='commercial_document' and ra.resource_key=d.id and ra.action='reverse_replace' order by ra.occurred_at desc limit 1) replacement_id,
       (select ra.resource_key from resource_audit_events ra where ra.organization_id=d.organization_id and ra.resource_type='commercial_document' and ra.action='reverse_replace' and ra.after_state->>'replacementId'=d.id order by ra.occurred_at desc limit 1) corrected_from_id,
       (select coalesce(nullif(lcat.category_code,''),nullif(lcat.dimensions->>'category',''),
          (select nullif(a.dimensions->>'category','') from commercial_document_allocations a
           where a.organization_id=lcat.organization_id and a.document_id=lcat.document_id and a.line_number=lcat.line_number
           order by a.allocation_number limit 1))
          from commercial_document_lines lcat
         where lcat.organization_id=d.organization_id and lcat.document_id=d.id
           and (lcat.category_code is not null or lcat.dimensions ? 'category' or exists (
             select 1 from commercial_document_allocations a
              where a.organization_id=lcat.organization_id and a.document_id=lcat.document_id
                and a.line_number=lcat.line_number and a.dimensions ? 'category'))
         order by lcat.line_number limit 1) category,
       (select jsonb_build_object('system',r.system,'externalId',r.external_id,'canonicalUrl',r.canonical_url,
          'checksum',r.checksum,'version',r.version,'syncedAt',r.synced_at::text,'metadata',r.metadata)
          from external_references r where r.organization_id=d.organization_id and r.document_id=d.id) as "externalReference",
       coalesce(json_agg(jsonb_build_object(
        'lineNumber',l.line_number,'description',l.description,'quantity',l.quantity,
        'unitPriceMinor',l.unit_price_minor::text,'netMinor',l.net_minor::text,'taxMinor',l.tax_minor::text,
        'grossMinor',l.gross_minor::text,'primaryAccountCode',l.primary_account_code,
        'categoryCode',l.category_code,'taxAccountCode',l.tax_account_code,'taxCode',l.tax_code,
        'managementState',l.management_state::text,'citState',l.cit_state::text,'vatState',l.vat_state::text,
        'citEligibleMinor',l.cit_eligible_minor::text,'vatEligibleMinor',l.vat_eligible_minor::text,
        'paymentEvidenceMissing',l.payment_evidence_missing,
        'reviewedBy',l.reviewed_by,'reviewedAt',l.reviewed_at::text,'reviewReason',l.review_reason,
        'reviewReference',l.review_reference,'dimensions',l.dimensions,
        'allocations',(select coalesce(json_agg(a order by a.allocation_number),'[]')
          from commercial_document_allocations a where a.organization_id=l.organization_id
            and a.document_id=l.document_id and a.line_number=l.line_number))
        order by l.line_number) filter (where l.line_number is not null),'[]') lines
       from commercial_documents d left join commercial_document_lines l
         on l.organization_id=d.organization_id and l.document_id=d.id
       where d.organization_id=$1 and d.id=$2 group by d.organization_id,d.id`,
      [organizationId, id],
    );
    return result.rows[0];
  }

  create = createOperation;

  deleteDraft = deleteDraftOperation;

  update = updateOperation;

  transition = transitionOperation;

  reverseReplace = reverseReplaceOperation;

  ensureJournalReversed = ensureJournalReversedOperation;

  reverse = reverseOperation;

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
    const result = await this.pool.query<{ document_id: string | null }>(
      `select document_id from external_references
        where organization_id=$1 and system=$2 and external_id=$3`,
      [organizationId, system, externalId],
    );
    return result.rows[0]?.document_id ?? undefined;
  }

  async accountRootType(organizationId: string, code: string): Promise<string | undefined> {
    const result = await this.pool.query<{ root_type: string; is_active: boolean }>(
      `select root_type::text,is_active from accounts where organization_id=$1 and code=$2`,
      [organizationId, code],
    );
    const row = result.rows[0];
    return row?.is_active ? row.root_type : undefined;
  }

  reclassifyAccounts = reclassifyAccountsOperation;

  async reclassifyFunding(
    context: CommercialDocumentContext,
    id: string,
    expectedVersion: string,
    targetControlAccountCode: string,
    reason: string,
    idempotencyKey: string,
    options?: { financialAccountId?: string },
  ) {
    const existing = await this.get(context.organizationId, id);
    if (!existing) throw new Error("RESOURCE_NOT_FOUND");
    if (existing.type !== "purchase_invoice") throw new Error("VALIDATION_FAILED");
    const replacementBase = await buildPurchaseFundingReplacement(
      this.pool,
      context.organizationId,
      existing as unknown as Record<string, unknown>,
      targetControlAccountCode,
      options?.financialAccountId?.trim(),
    );
    const replacement = {
      ...replacementBase,
      ...mergePaymentEvidenceFields({}, existing),
    };
    return this.reverseReplace(
      context,
      id,
      expectedVersion,
      replacement,
      reason,
      idempotencyKey,
      true,
    );
  }

  nextActions(type: CommercialDocumentType, state: string) {
    return Object.keys(NEXT[type][state] ?? {});
  }
  assertSalesContractCoverage(
    client: PoolClient,
    organizationId: string,
    document: StoredDocument,
  ) {
    return assertSalesContractCoverageQuery(client, organizationId, document);
  }
  async lockReplay(client: PoolClient, organizationId: string, key: string, hash: string) {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${organizationId}:${key}`,
    ]);
    const replay = await client.query<{
      request_hash: string;
      response_body: Record<string, unknown>;
    }>(
      "select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2 for update",
      [organizationId, key],
    );
    if (!replay.rows[0]) return undefined;
    if (replay.rows[0].request_hash !== hash) throw new Error("IDEMPOTENCY_CONFLICT");
    return replay.rows[0].response_body;
  }
  saveReplay(
    client: PoolClient,
    organizationId: string,
    key: string,
    operation: string,
    hash: string,
    response: unknown,
  ) {
    return client.query(
      `insert into api_idempotency_records
      (organization_id,idempotency_key,operation,request_hash,response_body) values ($1,$2,$3,$4,$5)`,
      [organizationId, key, operation, hash, response],
    );
  }
  async assertSelfApproval(client: PoolClient, context: CommercialDocumentContext, total: bigint) {
    const policy = await resolveOrganizationWorkflowPolicy(context.organizationId, client);
    if (!canSelfApprove({ policy, roles: context.roles, amountMinor: total }))
      throw new Error("MAKER_CHECKER_VIOLATION");
  }
  async assertPostingPeriod(client: PoolClient, context: CommercialDocumentContext, date: string) {
    const period = await client.query<{ state: string }>(
      `select state from fiscal_periods where organization_id=$1 and $2::date between starts_on and ends_on`,
      [context.organizationId, date],
    );
    if (period.rows.length !== 1)
      throw new Error(period.rows.length ? "FISCAL_PERIOD_AMBIGUOUS" : "FISCAL_PERIOD_NOT_FOUND");
    if (period.rows[0]!.state === "hard_locked") throw new Error("PERIOD_HARD_LOCKED");
    if (
      period.rows[0]!.state === "soft_locked" &&
      !context.roles.some((r) => ["owner", "finance_admin"].includes(r))
    )
      throw new Error("PERIOD_SOFT_LOCKED");
  }
  assertCreditAllowed(
    client: PoolClient,
    organizationId: string,
    input: CreateCommercialDocumentInput,
    excludeDocumentId?: string,
  ) {
    return assertCreditAllowedQuery(client, organizationId, input, excludeDocumentId);
  }

  postDocumentJournal = postDocumentJournalOperation;
}
