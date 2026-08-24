import type { MutationMetadata } from "./index.js";

export const PROJECT_ECONOMICS_CONTRACT_VERSION = 1 as const;
export type ProjectEconomicsTransitionRequest = Readonly<{
  schemaVersion: typeof PROJECT_ECONOMICS_CONTRACT_VERSION;
  expectedResourceVersion: string;
  reason: string;
}>;

export type ProjectBudgetLineContract = Readonly<{
  id: string;
  category: "revenue" | "labor" | "freelancer" | "vendor" | "tool" | "travel" | "overhead";
  amountMinor: string;
  serviceLineCode?: string;
  milestoneId?: string;
  note?: string;
}>;
export type ProjectBudgetVersionContract = Readonly<{
  id: string;
  projectId: string;
  versionNumber: number;
  kind: "baseline" | "revision";
  previousVersionId?: string;
  scopeChangeId?: string;
  currency: string;
  effectiveOn: string;
  state: "draft" | "submitted" | "approved" | "rejected" | "superseded";
  lines: readonly ProjectBudgetLineContract[];
  revenueTotalMinor: string;
  directCostTotalMinor: string;
  overheadTotalMinor: string;
  resourceVersion: string;
  nextActions?: readonly string[];
}>;
export type CreateProjectBudgetVersionRequest = Readonly<{
  schemaVersion: typeof PROJECT_ECONOMICS_CONTRACT_VERSION;
  id?: string;
  versionNumber: number;
  kind: "baseline" | "revision";
  previousVersionId?: string;
  scopeChangeId?: string;
  currency: string;
  effectiveOn: string;
  lines: readonly ProjectBudgetLineContract[];
  reason: string;
}>;

export type ScopeChangeContract = Readonly<{
  id: string;
  projectId: string;
  reason: string;
  expectedRevenueImpactMinor: string;
  expectedCostImpactMinor: string;
  expectedScheduleImpactDays: number;
  evidenceIds: readonly string[];
  state: "draft" | "submitted" | "approved" | "rejected";
  resourceVersion: string;
  nextActions: readonly string[];
}>;
export type CreateScopeChangeRequest = Readonly<{
  schemaVersion: typeof PROJECT_ECONOMICS_CONTRACT_VERSION;
  id?: string;
  reason: string;
  expectedRevenueImpactMinor: string;
  expectedCostImpactMinor: string;
  expectedScheduleImpactDays: number;
  evidenceIds?: readonly string[];
}>;

export type RevenueRecognitionPolicyContract = Readonly<{
  id: string;
  projectId: string;
  contractId: string;
  method:
    "milestone_acceptance" | "percentage_of_completion" | "time_and_materials" | "manual_reviewed";
  effectiveFrom: string;
  effectiveTo?: string;
  revenueAccountCode: string;
  deferredRevenueAccountCode: string;
  contractAssetAccountCode?: string;
  evidenceRequirements: readonly string[];
  state: "draft" | "approved" | "retired";
  resourceVersion: string;
  nextActions: readonly string[];
}>;
export type CreateRevenueRecognitionPolicyRequest = Readonly<{
  schemaVersion: typeof PROJECT_ECONOMICS_CONTRACT_VERSION;
  id?: string;
  projectId: string;
  contractId: string;
  method: RevenueRecognitionPolicyContract["method"];
  effectiveFrom: string;
  effectiveTo?: string;
  revenueAccountCode: string;
  deferredRevenueAccountCode: string;
  contractAssetAccountCode?: string;
  evidenceRequirements: readonly string[];
  reason: string;
}>;

export type MilestoneAcceptanceContract = Readonly<{
  id: string;
  milestoneId: string;
  milestoneAmountMinor: string;
  state: "pending" | "accepted" | "disputed" | "rejected";
  acceptedAmountMinor?: string;
  acceptedPercentage?: string;
  acceptedOn?: string;
  evidenceIds: readonly string[];
  reason: string;
  resourceVersion: string;
  nextActions: readonly string[];
}>;
export type CreateMilestoneAcceptanceRequest = Readonly<{
  schemaVersion: typeof PROJECT_ECONOMICS_CONTRACT_VERSION;
  id?: string;
  milestoneId: string;
  reason: string;
}>;
export type AcceptMilestoneRequest = ProjectEconomicsTransitionRequest &
  Readonly<{
    acceptedOn: string;
    acceptedAmountMinor?: string;
    acceptedPercentage?: string;
    evidenceIds: readonly string[];
  }>;

/** Canonical v1 response returned by revenue-recognition-events list and detail APIs. */
export type RevenueRecognitionEventV1 = Readonly<{
  id: string;
  projectId: string;
  projectName: string;
  customerPartyId: string;
  customerName: string;
  policyId: string;
  policyVersionNumber: number;
  milestoneAcceptanceId?: string | null;
  effectiveOn: string;
  currency: string;
  amountMinor: string;
  evidenceIds: readonly string[];
  policySnapshot: Readonly<Record<string, unknown>>;
  state: "draft" | "submitted" | "approved" | "posted" | "reversed";
  journalId?: string | null;
  reversalJournalId?: string | null;
  reason: string;
  resourceVersion: string;
  nextActions?: readonly string[];
}>;
export type RevenueRecognitionEventContract = RevenueRecognitionEventV1;

/**
 * @deprecated Legacy presentation-only field names never matched the persisted v1 API. Kept for
 * source compatibility; new clients must use RevenueRecognitionEventV1.
 */
export type LegacyRevenueRecognitionEventPresentation = Readonly<{
  recognitionDate?: string;
  contractId?: string;
  milestoneId?: string;
  policyVersionId?: string;
  baseAmountMinor?: string;
  accountingRoute?: "deferred_revenue" | "contract_asset";
  sourceEvidenceIds?: readonly string[];
}>;
export type CreateRevenueRecognitionEventRequest = Readonly<{
  schemaVersion: typeof PROJECT_ECONOMICS_CONTRACT_VERSION;
  id?: string;
  projectId: string;
  policyId: string;
  policyVersionNumber: number;
  milestoneAcceptanceId?: string;
  effectiveOn: string;
  currency: string;
  amountMinor: string;
  evidenceIds: readonly string[];
  reason: string;
}>;

export type ProjectRevenueAxesContract = Readonly<{
  projectId: string;
  startsOn: string;
  endsOn: string;
  currency: string;
  recognizedNetMinor: string;
  invoicedNetMinor: string;
  collectedGrossMinor: string;
  collectedNetMinor: string;
  deferredRevenueMinor: string;
  contractAssetMinor: string;
  recognitionEventIds: readonly string[];
  invoiceIds: readonly string[];
  reconciliationIds: readonly string[];
  journalIds: readonly string[];
}>;

export type ProjectEconomicsMutationResult<T> = Readonly<{
  resource: T;
  mutation: MutationMetadata;
}>;
