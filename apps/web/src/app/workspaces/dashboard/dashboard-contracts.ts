import type {
  AgingReportContract,
  ExecutiveMetricsContract,
  NegativeCustodyAlertContract,
  PerformanceComparisonContract,
  ProfitAndLossContract,
  TaxExpenseReviewContract,
  VatReconciliationContract,
} from "@naai-erp/contracts";
import type { ProjectProfitabilityReport } from "@/lib/api/project-profitability";

export type DashboardData = Readonly<{
  executive?: ExecutiveMetricsContract;
  performance?: PerformanceComparisonContract;
  projects?: ProjectProfitabilityReport;
  aging?: AgingReportContract;
  profitAndLoss?: ProfitAndLossContract;
  taxExpenses?: TaxExpenseReviewContract;
  vat?: VatReconciliationContract;
  operating?: OperatingDashboardWire;
  actualSummary?: ActualFactSummaryWire;
  failures?: Readonly<
    Record<
      | "executive"
      | "performance"
      | "projects"
      | "aging"
      | "profitAndLoss"
      | "taxExpenses"
      | "vat"
      | "operating"
      | "actualSummary",
      string
    >
  >;
  searchKey?: string;
}>;

export type ActualFactSummaryWire = Readonly<{
  actualBasis: "recognized" | "invoiced" | "collected";
  from: string;
  to: string;
  currency: string;
  amountMinor: string;
  factCount: number;
  sourceIds: readonly string[];
}>;

export type SourceControlMonthlyWire = Readonly<{
  id: string;
  kind: "profitability_control" | "planning_control";
  period: string;
  revenueMinor: string;
  receivedMinor: string;
  expenseMinor: string;
  profitMinor: string;
}>;

export type OperatingProjectWire = Readonly<{
  projectId?: string;
  code?: string;
  name?: string;
  clientName?: string;
  state?: string;
  startsOn?: string;
  endsOn?: string | null;
  contractedMinor?: string;
  invoicedMinor?: string;
  collectedMinor?: string;
  actualCostMinor?: string;
  budgetCostMinor?: string;
  burnBps?: number | null;
  estimateAtCompletionMinor?: string;
  eacMethod?: string;
  backlogMinor?: string;
  invoicedProgressBps?: number | null;
}>;

export type OperatingClientWire = Readonly<{
  clientId?: string;
  clientName?: string;
  revenueMinor?: string;
  invoiceCount?: number;
  shareBps?: number | null;
}>;

export type OperatingDashboardWire = Readonly<{
  schemaVersion: 1;
  asOf: string;
  currency: string;
  backlog: Readonly<{
    projectCount: number;
    contractedMinor: string;
    invoicedMinor: string;
    remainingMinor: string;
    projects: readonly OperatingProjectWire[];
    portfolioProgressBps?: number | null;
    projectPipeline?: readonly OperatingProjectWire[];
    projectHighlights?: readonly OperatingProjectWire[];
  }>;
  collections: Readonly<{
    receivablesMinor: string;
    creditSalesMinor: string;
    dsoDays: number | null;
    overdueMinor: string;
    overdueCount?: number;
    dueWithin7DaysMinor: string;
    dueWithin30DaysMinor: string;
    laterMinor: string;
  }>;
  projectBurn: readonly OperatingProjectWire[];
  clientConcentration: Readonly<{
    totalRevenueMinor: string;
    topClientShareBps: number | null;
    topThreeShareBps: number | null;
    clients: readonly OperatingClientWire[];
  }>;
  financials: Readonly<{
    revenueMinor: string;
    expenseMinor: string;
    netProfitMinor: string;
    unrestrictedCashMinor: string | null;
    bankAvailableMinor: string;
    cashOnHandMinor: string;
    companyCashOnHandMinor?: string;
    cashAndBankMinor: string;
    totalCompanyFundsMinor?: string;
    companyFundsReconciliationGapMinor?: string;
    ownerPayableMinor: string;
    companyOwesOwnerMinor?: string;
    ownerHoldsCompanyFundsMinor?: string;
    ownerCashCustodyMinor?: string;
    negativeOwnerCustodyAlert?: NegativeCustodyAlertContract | null;
    statutoryOwnerCurrentBalanceMinor?: string;
    ownerOperatingPayableMinor?: string;
    netAvailableCashMinor: string;
    actualOwnerPaidCompanyCostMinor?: string;
    netCompanyFundsMinor?: string;
    ownerPaidClassificationStatus?: "ready" | "review_required" | "unconfigured";
    unclassifiedOwnerPaidCount?: number;
    unclassifiedOwnerPaidMinor?: string;
    paymentEvidenceGaps?: Readonly<{
      status: "ready" | "warning";
      nonCashThresholdMinor: string;
      recordCount: number;
      lineCount: number;
      withheldCitMinor: string;
      withheldVatMinor: string;
      reportPath: string;
    }>;
    configurationWarnings?: readonly string[];
    corporateIncomeTaxRateBps: number | null;
    rosBps: number | null;
    recognitionEventCount: number;
    approvedBudgetCount: number;
    postedOverheadRunCount: number;
    source: "posted_ledger";
    monthly?: readonly Readonly<{
      period: string;
      revenueMinor: string;
      expenseMinor: string;
      netProfitMinor?: string;
    }>[];
    taxableProfitMinor?: string;
    corporateIncomeTaxMinor?: string;
    corporateIncomeTaxAssumption?: string;
    corporateIncomeTaxBasis?: string;
    priorYearRevenueMinor?: string | null;
    citSmallEnterpriseIneligible?: boolean;
  }>;
  dataQuality: Readonly<{
    pendingCount: number;
    flaggedCount?: number;
    byFlag: readonly Readonly<{ flag: string; count: number }>[];
    rows: readonly Record<string, unknown>[];
  }>;
  sourceControls?: Readonly<{
    accountingStatus: "unconfirmed_non_canonical";
    rowCount: number;
    byKind: readonly Readonly<{ kind: string; count: number }>[];
    monthly: readonly SourceControlMonthlyWire[];
    expenseCategories?: readonly Readonly<{
      id: string;
      category: string;
      monthlyAmounts: readonly Readonly<{ period: string; amountMinor: string }>[];
    }>[];
  }>;
}>;

export type PeriodKind = "month" | "quarter" | "year";

export type DimensionValue = Readonly<{
  kind: string;
  code: string;
  name: string;
  is_active: boolean;
}>;

export type ExpenseOverviewRow = Record<string, unknown> & {
  __sourceKind: "documents" | "expenses";
  __invoicePresence: "present" | "missing";
};
