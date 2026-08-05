export const PROJECT_PROFITABILITY_CONTRACT_VERSION = 1 as const;

export type ProjectProfitabilityGroupByContract =
  "project" | "client" | "service_line" | "account_owner";

export type ProjectProfitabilityConfidenceCodeContract =
  "unbilled_work" | "overdue_ar" | "budget_overrun" | "missing_dimensions";

export type ProjectProfitabilityQueryContract = Readonly<{
  startsOn: string;
  endsOn: string;
  groupBy?: ProjectProfitabilityGroupByContract;
  projectId?: string;
  clientId?: string;
  serviceLineCode?: string;
  accountOwnerId?: string;
  confidenceCode?: ProjectProfitabilityConfidenceCodeContract;
  cursor?: string;
  limit?: number;
}>;

export type ProjectProfitabilityConfidenceFlagContract = Readonly<{
  code: ProjectProfitabilityConfidenceCodeContract;
  severity: "warning" | "critical";
  amountMinor?: string;
  sourceIds: readonly string[];
}>;

export type ProjectProfitabilityDrilldownContract = Readonly<{
  recognitionEventIds: readonly string[];
  invoiceIds: readonly string[];
  reconciliationIds: readonly string[];
  directCostItemIds: readonly string[];
  overheadAllocationRunIds: readonly string[];
  overheadAllocationSplitIds: readonly string[];
  timesheetIds: readonly string[];
  budgetVersionIds: readonly string[];
  journalIds: readonly string[];
}>;

export type ProjectProfitabilityContract = Readonly<{
  schemaVersion: typeof PROJECT_PROFITABILITY_CONTRACT_VERSION;
  organizationId: string;
  projectId: string;
  clientId?: string;
  serviceLineCode?: string;
  accountOwnerId?: string;
  startsOn: string;
  endsOn: string;
  currency: string;
  recognizedRevenueMinor: string;
  invoicedRevenueMinor: string;
  collectedRevenueMinor: string;
  directProjectCostMinor: string;
  variableOverheadMinor: string;
  fixedOverheadMinor: string;
  fullyLoadedCostMinor: string;
  grossMarginMinor: string;
  grossMarginBps: number | null;
  contributionMarginMinor: string;
  contributionMarginBps: number | null;
  fullyLoadedProfitMinor: string;
  fullyLoadedMarginBps: number | null;
  realizedHourlyRateMinor: string | null;
  utilizationBps: number | null;
  budgetCostMinor: string;
  overrunMinor: string;
  overrunBps: number | null;
  unbilledWorkMinor: string;
  overdueArMinor: string;
  billableMinutes: number;
  projectMinutes: number;
  availableMinutes: number;
  confidenceFlags: readonly ProjectProfitabilityConfidenceFlagContract[];
  drilldown: ProjectProfitabilityDrilldownContract;
}>;
