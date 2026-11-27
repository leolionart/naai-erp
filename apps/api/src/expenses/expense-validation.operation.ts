import { type PoolClient } from "pg";
import { resolveOwnerFundingTraceability } from "../owner-funding/owner-funding-traceability.js";
import type { CreateExpenseInput } from "./expense.types.js";
import { type StoredExpense } from "./pg-expense.store.shared.js";
import type { PgExpenseStore } from "./pg-expense.store.js";

export async function validateRelationshipsOperation(
  this: PgExpenseStore,
  organizationId: string,
  input: CreateExpenseInput,
) {
  await resolveOwnerFundingTraceability(this.pool, organizationId, {
    ownerFundingId: input.ownerFundingId ?? input.funding?.ownerFundingId,
    ownerFundingTransactionId:
      input.ownerFundingTransactionId ?? input.funding?.ownerFundingTransactionId,
    fundingType: input.funding?.type,
    fundingFinancialAccountId: input.fundingFinancialAccountId,
    accountCode: input.counterAccountCode,
    currency: input.currency,
  });
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

export async function relationshipBackfillInventoryOperation(
  this: PgExpenseStore,
  organizationId: string,
) {
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

export async function assertReviewReadyOperation(
  this: PgExpenseStore,
  c: PoolClient,
  organizationId: string,
  e: StoredExpense,
  sourceDocumentCounts = false,
) {
  const r = await c.query<{
    management_state: string;
    cit_state: string;
    vat_state: string;
    vat_eligible_minor: string;
    payment_evidence_missing: boolean;
  }>(
    "select management_state,cit_state,vat_state,vat_eligible_minor::text,payment_evidence_missing from expense_lines where organization_id=$1 and expense_id=$2",
    [organizationId, e.id],
  );
  if (
    r.rows.length === 0 ||
    r.rows.some(
      (line) =>
        (!["valid", "accountant_override"].includes(line.management_state) &&
          e.expense_class !== "owner_personal") ||
        ((line.cit_state === "unreviewed" || line.vat_state === "unreviewed") &&
          !(sourceDocumentCounts && line.payment_evidence_missing)),
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
    if (required.some((name) => !types.has(name))) {
      // Paperless/n8n own the source files: a linked external document is the evidence of record
      // for a solopreneur owner, so it is accepted without a duplicate ERP evidence upload.
      const linked = sourceDocumentCounts
        ? await c.query(
            "select 1 from external_references where organization_id=$1 and expense_id=$2 limit 1",
            [organizationId, e.id],
          )
        : undefined;
      if (!linked?.rows[0]) throw new Error("EXPENSE_EVIDENCE_INCOMPLETE");
    }
  }
}
