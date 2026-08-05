import type { MutationMetadata } from "./index.js";

export const PROJECT_COST_CONTRACT_VERSION = 1 as const;

export type ProjectCostBasisContract = "ledger" | "management";
export type ProjectCostClassContract =
  "labor" | "freelancer" | "vendor_service" | "project_tool" | "travel" | "other_direct";
export type ProjectCostSourceTypeContract =
  | "timesheet_cost"
  | "timesheet_adjustment"
  | "expense_allocation"
  | "purchase_invoice_allocation"
  | "reclassification";

export type ProjectCostDrilldownContract = Readonly<{
  sourceType: ProjectCostSourceTypeContract;
  sourceId: string;
  sourceLineId?: string;
  sourceAllocationId?: string;
  directCostAllocationId?: string;
  journalId?: string;
  journalLineId?: string;
  timesheetId?: string;
  workerId?: string;
  evidenceIds: readonly string[];
  sourceHref: string;
  journalHref?: string;
  timesheetHref?: string;
  evidenceHrefs: readonly string[];
}>;

export type ProjectCostItemContract = Readonly<{
  id: string;
  projectId: string;
  costClass: ProjectCostClassContract;
  basis: ProjectCostBasisContract;
  effectiveOn: string;
  currency: string;
  amountMinor: string;
  baseAmountMinor: string;
  ledgerAccountCode?: string;
  drilldown: ProjectCostDrilldownContract;
}>;

export type ProjectCostSourceContract = Readonly<{
  id: string;
  sourceType: ProjectCostSourceTypeContract;
  sourceId: string;
  sourceLineId?: string;
  sourceAllocationId?: string;
  costClass: ProjectCostClassContract;
  basis: ProjectCostBasisContract;
  effectiveOn: string;
  currency: string;
  amountMinor: string;
  baseAmountMinor: string;
  remainingAmountMinor: string;
  remainingBaseAmountMinor: string;
  disposition: "unallocated" | "direct" | "overhead_reserved";
  ledgerAccountCode?: string;
  journalId?: string;
  journalLineId?: string;
  timesheetId?: string;
  workerId?: string;
  evidenceIds: readonly string[];
}>;

export type CreateDirectCostSplitRequest = Readonly<{
  id?: string;
  projectId: string;
  amountMinor: string;
  baseAmountMinor: string;
}>;

export type CreateDirectCostAllocationRequest = Readonly<{
  schemaVersion: typeof PROJECT_COST_CONTRACT_VERSION;
  id?: string;
  sourceId: string;
  splits: readonly CreateDirectCostSplitRequest[];
  reason: string;
}>;

export type DirectCostAllocationTransitionRequest = Readonly<{
  schemaVersion: typeof PROJECT_COST_CONTRACT_VERSION;
  expectedResourceVersion: string;
  reason: string;
}>;

export type DirectCostSplitContract = Readonly<{
  id: string;
  projectId: string;
  amountMinor: string;
  baseAmountMinor: string;
}>;

export type DirectCostAllocationEventContract = Readonly<{
  sequence: number;
  action: "create" | "submit" | "approve" | "post" | "reverse";
  actorId: string;
  occurredAt: string;
  reason: string;
}>;

export type DirectCostAllocationContract = Readonly<{
  id: string;
  source: ProjectCostSourceContract;
  splits: readonly DirectCostSplitContract[];
  state: "draft" | "submitted" | "approved" | "posted" | "reversed";
  submittedBy?: string;
  approvedBy?: string;
  journalId?: string;
  reversalJournalId?: string;
  resourceVersion: string;
  nextActions: readonly string[];
  events: readonly DirectCostAllocationEventContract[];
}>;

export type DirectCostAllocationMutationResult = Readonly<{
  allocation: DirectCostAllocationContract;
  mutation: MutationMetadata;
}>;
