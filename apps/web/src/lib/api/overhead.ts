export type OverheadPolicy = Readonly<{
  id: string;
  policyCode: string;
  versionNumber: number;
  name: string;
  method: "revenue" | "labor_hours" | "headcount" | "fixed_percentage" | "manual";
  costClass: "variable" | "fixed";
  effectiveFrom: string;
  effectiveTo?: string;
  configuration: Record<string, unknown>;
  state: string;
  resourceVersion: string;
}>;
export type OverheadPool = Readonly<{
  id: string;
  policyId: string;
  policyVersionNumber: number;
  periodStart: string;
  periodEnd: string;
  currency: string;
  sourceAmountMinor: string;
  sourceBaseAmountMinor: string;
  state: string;
  resourceVersion: string;
  reason: string;
  items?: readonly Readonly<{
    sourceCostItemId: string;
    amountMinor: string;
    baseAmountMinor: string;
  }>[];
}>;
export type OverheadRun = Readonly<{
  id: string;
  poolId: string;
  policyId: string;
  policyVersionNumber: number;
  method: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  allocatableAmountMinor: string;
  basisSnapshot: unknown;
  policySnapshot: unknown;
  state: string;
  resourceVersion: string;
  reason: string;
  journalId?: string;
  reversalJournalId?: string;
  splits?: readonly Readonly<{
    projectId: string;
    basisValue: string;
    basisTotal: string;
    amountMinor: string;
    roundingRank: number;
  }>[];
}>;
const root = {
  policies: "overhead-allocation-policies",
  pools: "overhead-source-pools",
  runs: "overhead-allocation-runs",
} as const;
export const overheadApi = Object.freeze({
  ...root,
  detail: (resource: keyof typeof root, id: string) =>
    `${root[resource]}/${encodeURIComponent(id)}`,
  action: (resource: keyof typeof root, id: string, action: string) =>
    `${root[resource]}/${encodeURIComponent(id)}/${action}`,
});
