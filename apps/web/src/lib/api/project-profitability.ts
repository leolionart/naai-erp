export type ProfitabilityConfidenceFlag =
  "unbilled_work" | "overdue_ar" | "budget_overrun" | "missing_dimensions";

export type ProfitabilityConfidenceFlagDetail = Readonly<{
  code: ProfitabilityConfidenceFlag;
  severity: "warning" | "critical";
  amountMinor?: string | null;
  sourceIds: readonly string[];
}>;

export type ProjectProfitabilitySummary = Readonly<{
  projectId: string;
  projectCode: string;
  projectName: string;
  clientId?: string | null;
  clientName?: string | null;
  serviceLineId?: string | null;
  serviceLineName?: string | null;
  accountOwnerId?: string | null;
  accountOwnerName?: string | null;
  currency: string;
  recognizedRevenueMinor: string;
  invoicedRevenueMinor: string;
  collectedRevenueMinor: string;
  directProjectCostMinor: string;
  directCostMinor: string;
  grossMarginMinor: string;
  grossMarginBps: number | null;
  budgetRevenueMinor?: string;
  budgetCostMinor?: string;
  overrunAmountMinor: string;
  unbilledWorkMinor?: string;
  overdueArMinor?: string;
  confidenceCodes: readonly ProfitabilityConfidenceFlag[];
  confidenceFlags: readonly ProfitabilityConfidenceFlagDetail[];
}>;

export type ProjectProfitabilityTotals = Readonly<{
  projectCount: number;
  recognizedRevenueMinor: string;
  directCostMinor: string;
  grossMarginMinor: string;
  invoicedRevenueMinor?: string;
  collectedRevenueMinor?: string;
  budgetCostMinor?: string;
  overrunMinor?: string;
  unbilledWorkMinor?: string;
  overdueArMinor?: string;
}>;

export type ProjectProfitabilityReport = Readonly<{
  asOf: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  items: readonly ProjectProfitabilitySummary[];
  totals: ProjectProfitabilityTotals;
}>;

export type ProfitabilityBreakdownRow = Readonly<{
  id: string;
  label: string;
  kind?: string;
  amountMinor: string;
  hours?: string | null;
  sourceId?: string | null;
  sourceType?: string | null;
  costClass?: "variable" | "fixed" | null;
  costRateVersionId?: string | null;
  sourcePoolId?: string | null;
  policyId?: string | null;
  runId?: string | null;
  journalId?: string | null;
}>;

export type ProfitabilityConfidenceDetail = ProfitabilityConfidenceFlagDetail &
  Readonly<{
    title: string;
    description: string;
  }>;

export type RevenueProfitabilityBreakdown = Readonly<{
  kind: "recognized" | "invoiced" | "collected";
  amountMinor: string;
  sourceIds: readonly string[];
}>;

export type DirectCostProfitabilityBreakdown = Readonly<{
  kind: "expense" | "purchase_document";
  amountMinor: string;
  sourceIds: readonly string[];
}>;

export type OverheadProfitabilityBreakdown = Readonly<{
  costClass: "variable" | "fixed";
  amountMinor: string;
  sourcePoolIds: readonly string[];
  policyIds: readonly string[];
  runIds: readonly string[];
  journalIds: readonly string[];
}>;

type ProfitabilityTieLine = Readonly<{
  sourceMinor: string;
  ledgerMinor: string;
  differenceMinor: string;
  status: "tied_out" | "difference" | "not_posted_to_gl";
}>;

export type ProjectProfitabilityGlTie = ProfitabilityTieLine;

export type ProjectProfitabilityDetail = ProjectProfitabilitySummary &
  Readonly<{
    asOf: string;
    periodStart: string;
    periodEnd: string;
    revenueBreakdown: readonly RevenueProfitabilityBreakdown[];
    directCostBreakdown: readonly DirectCostProfitabilityBreakdown[];
    overheadBreakdown?: readonly OverheadProfitabilityBreakdown[];
    confidenceDetails: readonly ProfitabilityConfidenceDetail[];
    glTie: ProjectProfitabilityGlTie;
    controlStatus?: "tied_out" | "difference";
    controlDifferenceMinor?: string;
  }>;

const p = encodeURIComponent;
export const projectProfitabilityApi = Object.freeze({
  report: "reports/project-profitability",
  project: (projectId: string) => `reports/project-profitability/projects/${p(projectId)}`,
});
