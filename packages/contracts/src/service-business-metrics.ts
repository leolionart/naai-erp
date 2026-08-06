export const SERVICE_BUSINESS_METRICS_CONTRACT_VERSION = 1 as const;
export const SERVICE_BUSINESS_METRICS_FORMULA_VERSION = "service-business-metrics-v1" as const;

export type ServiceBusinessConfidenceCodeContract =
  | "missing_client"
  | "missing_project"
  | "missing_contract_value"
  | "contract_over_recognized"
  | "missing_project_budget"
  | "missing_estimate_to_complete"
  | "zero_credit_revenue"
  | "zero_ar_balance"
  | "high_overdue_ar"
  | "high_client_revenue_concentration"
  | "high_client_ar_concentration";

export type ServiceBusinessConfidenceFlagContract = Readonly<{
  code: ServiceBusinessConfidenceCodeContract;
  severity: "info" | "warning" | "critical";
  sourceIds: readonly string[];
  amountMinor?: string;
  ratioBps?: number;
}>;

export type ServiceBusinessMetricsQueryContract = Readonly<{
  startsOn: string;
  endsOn: string;
  asOfDate: string;
  clientId?: string;
  projectId?: string;
  serviceLineCode?: string;
}>;

export type ServiceBusinessMetricsContract = Readonly<{
  schemaVersion: typeof SERVICE_BUSINESS_METRICS_CONTRACT_VERSION;
  organizationId: string;
  startsOn: string;
  endsOn: string;
  asOfDate: string;
  currency: string;
  formulaVersion: typeof SERVICE_BUSINESS_METRICS_FORMULA_VERSION;
  contractedValueMinor: string;
  remainingContractValueMinor: string;
  contractedBacklogMinor: string;
  backlogCoverageMonthsThousandths: string | null;
  accountsReceivableMinor: string;
  overdueAccountsReceivableMinor: string;
  dsoDaysThousandths: string | null;
  overdueArBps: number | null;
  projectBudgetMinor: string;
  projectActualCostMinor: string;
  projectEstimateToCompleteMinor: string;
  projectEstimateAtCompletionMinor: string;
  projectBudgetBurnBps: number | null;
  projectEacVarianceMinor: string;
  projectEacVarianceBps: number | null;
  topClientRevenueBps: number | null;
  topClientArBps: number | null;
  revenueConcentrationHhiBps: number | null;
  arConcentrationHhiBps: number | null;
  recurringRevenueMinor: string;
  oneOffRevenueMinor: string;
  recurringRevenueBps: number | null;
  confidenceFlags: readonly ServiceBusinessConfidenceFlagContract[];
}>;
