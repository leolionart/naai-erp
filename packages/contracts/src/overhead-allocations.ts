import type { MutationMetadata } from "./index.js";
export const OVERHEAD_ALLOCATION_CONTRACT_VERSION = 1 as const;
export type OverheadAllocationMethod =
  "revenue" | "labor_hours" | "headcount" | "fixed_percentage" | "manual";
export type OverheadAllocationPolicyContract = Readonly<{
  id: string;
  policyCode: string;
  versionNumber: number;
  name: string;
  method: OverheadAllocationMethod;
  costClass: "variable" | "fixed";
  effectiveFrom: string;
  effectiveTo?: string;
  configuration: Readonly<Record<string, unknown>>;
  state: "draft" | "submitted" | "approved" | "rejected" | "retired";
  resourceVersion: string;
  nextActions: readonly string[];
}>;
export type CreateOverheadAllocationPolicyRequest = Readonly<{
  schemaVersion: typeof OVERHEAD_ALLOCATION_CONTRACT_VERSION;
  id?: string;
  policyCode: string;
  name: string;
  method: OverheadAllocationMethod;
  costClass: "variable" | "fixed";
  effectiveFrom: string;
  effectiveTo?: string;
  configuration: Readonly<Record<string, unknown>>;
  reason: string;
}>;
export type OverheadSourcePoolContract = Readonly<{
  id: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  sourceAmountMinor: string;
  sourceBaseAmountMinor: string;
  items: readonly Readonly<{
    sourceCostItemId: string;
    amountMinor: string;
    baseAmountMinor: string;
  }>[];
  state: string;
  resourceVersion: string;
}>;
export type OverheadAllocationSplitContract = Readonly<{
  projectId: string;
  basisValue: string;
  basisTotal: string;
  amountMinor: string;
  roundingRank: number;
}>;
export type OverheadAllocationRunContract = Readonly<{
  id: string;
  poolId: string;
  policyId: string;
  policyVersionNumber: number;
  method: OverheadAllocationMethod;
  periodStart: string;
  periodEnd: string;
  currency: string;
  allocatableAmountMinor: string;
  basisSnapshot: Readonly<Record<string, unknown>>;
  policySnapshot: Readonly<Record<string, unknown>>;
  splits: readonly OverheadAllocationSplitContract[];
  state: "draft" | "calculated" | "submitted" | "approved" | "rejected" | "posted" | "reversed";
  resourceVersion: string;
  journalId?: string;
  reversalJournalId?: string;
  reason: string;
  nextActions: readonly string[];
}>;
export type OverheadAllocationTransitionRequest = Readonly<{
  schemaVersion: typeof OVERHEAD_ALLOCATION_CONTRACT_VERSION;
  expectedResourceVersion: string;
  reason: string;
}>;
export type OverheadAllocationMutationResult<T> = Readonly<{
  resource: T;
  mutation: MutationMetadata;
}>;
