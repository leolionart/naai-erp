import { createHash } from "node:crypto";
import type { RecognitionResource } from "./project-recognition.types.js";

export const digest = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
export type PolicyRow = {
  currency: string;
  evidence_required: boolean;
  method: string;
  version_number: number;
  contract_value_minor: string;
  revenue_account_code: string;
  contract_asset_account_code: string;
  contract_liability_account_code: string;
};
export type BudgetApprovalRow = { project_id: string; kind: string; version_number: number };
export type PolicyApprovalRow = {
  project_id: string;
  effective_from: string;
  effective_to: string | null;
};
export type AcceptanceRow = {
  milestone_id: string;
  accepted_amount_minor: string;
  amount_minor: string;
};
export type RecognitionRow = {
  project_id: string;
  evidence_required: boolean;
  evidence_ids: readonly string[] | null;
  amount_minor: string;
  contract_value_minor: string;
  milestone_acceptance_id: string | null;
  effective_on: string;
  currency: string;
  journal_id: string | null;
  policy_snapshot: { contractAssetAccountCode: string; revenueAccountCode: string };
};
export type AcceptanceCapRow = { accepted_amount_minor: string; state: string };
export type IdempotencyRow = { request_hash: string; response_body: Record<string, unknown> };
export const TABLE: Record<RecognitionResource, string> = {
  "scope-changes": "scope_changes",
  "project-budgets": "project_budget_versions",
  "recognition-policies": "revenue_recognition_policies",
  "milestone-acceptances": "milestone_acceptances",
  "revenue-recognition-events": "revenue_recognition_events",
};
export const CAMEL_SQL: Record<RecognitionResource, string> = {
  "scope-changes": `select id,project_id "projectId",reason,expected_revenue_impact_minor::text "expectedRevenueImpactMinor",expected_cost_impact_minor::text "expectedCostImpactMinor",expected_schedule_impact_days "expectedScheduleImpactDays",evidence_ids "evidenceIds",state,version::text "resourceVersion",submitted_by "submittedBy",approved_by "approvedBy",rejected_by "rejectedBy" from scope_changes`,
  "project-budgets": `select id,project_id "projectId",version_number "versionNumber",kind,previous_version_id "previousVersionId",scope_change_id "scopeChangeId",currency,effective_on::text "effectiveOn",state,revenue_total_minor::text "revenueTotalMinor",direct_cost_total_minor::text "directCostTotalMinor",overhead_total_minor::text "overheadTotalMinor",version::text "resourceVersion",submitted_by "submittedBy",approved_by "approvedBy",rejected_by "rejectedBy" from project_budget_versions`,
  "recognition-policies": `select id,project_id "projectId",version_number "versionNumber",method,effective_from::text "effectiveFrom",effective_to::text "effectiveTo",currency,contract_value_minor::text "contractValueMinor",revenue_account_code "revenueAccountCode",contract_asset_account_code "contractAssetAccountCode",contract_liability_account_code "contractLiabilityAccountCode",evidence_required "evidenceRequired",state,version::text "resourceVersion",submitted_by "submittedBy",approved_by "approvedBy",rejected_by "rejectedBy" from revenue_recognition_policies`,
  "milestone-acceptances": `select a.id,a.milestone_id "milestoneId",c.project_id "projectId",a.accepted_amount_minor::text "acceptedAmountMinor",a.effective_on::text "effectiveOn",a.evidence_ids "evidenceIds",a.state,a.reason,a.version::text "resourceVersion",a.submitted_by "submittedBy",a.accepted_by "acceptedBy",a.rejected_by "rejectedBy" from milestone_acceptances a join milestones m on m.organization_id=a.organization_id and m.id=a.milestone_id join contracts c on c.organization_id=m.organization_id and c.id=m.contract_id`,
  "revenue-recognition-events": `select e.id,e.project_id "projectId",p.name "projectName",p.client_party_id "customerPartyId",party.display_name "customerName",e.policy_id "policyId",e.policy_version_number "policyVersionNumber",e.milestone_acceptance_id "milestoneAcceptanceId",e.effective_on::text "effectiveOn",e.amount_minor::text "amountMinor",e.currency,e.evidence_ids "evidenceIds",e.policy_snapshot "policySnapshot",e.state,e.version::text "resourceVersion",e.journal_id "journalId",e.reversal_journal_id "reversalJournalId",e.submitted_by "submittedBy",e.approved_by "approvedBy",e.rejected_by "rejectedBy",e.posted_by "postedBy",e.reversed_by "reversedBy",e.reason from revenue_recognition_events e join projects p on p.organization_id=e.organization_id and p.id=e.project_id join parties party on party.organization_id=p.organization_id and party.id=p.client_party_id`,
};
