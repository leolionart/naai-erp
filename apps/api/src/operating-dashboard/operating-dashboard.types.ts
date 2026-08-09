import type { JournalActorContext } from "../journals/journal.types.js";

export type OperatingDashboardQuery = Readonly<{
  asOf: string;
  startsOn: string;
  endsOn: string;
  limit: number;
}>;

export type OperatingDashboardContext = JournalActorContext;

export type WorkbookSourceControlKind =
  | "debt_control"
  | "profitability_control"
  | "planning_control"
  | "bonus_control"
  | "payroll_master"
  | "expense_category_control";

export type WorkbookSourceControlMonthlyRow = Readonly<{
  id: string;
  kind: "profitability_control" | "planning_control";
  period: string;
  revenueMinor: string;
  receivedMinor: string;
  expenseMinor: string;
  profitMinor: string;
  targetAttainmentBps?: number | null;
  forecastExpenseMinor?: string | null;
  forecastCashMinor?: string | null;
  reviewFlags: readonly string[];
}>;

export type WorkbookSourceControls = Readonly<{
  source: "workbook_import_review_rows";
  accountingStatus: "unconfirmed_non_canonical";
  rowCount: number;
  byKind: readonly Readonly<{ kind: WorkbookSourceControlKind; count: number }>[];
  monthly: readonly WorkbookSourceControlMonthlyRow[];
  debt: readonly Readonly<{
    id: string;
    period?: string | undefined;
    projectLabel: string;
    debtMinor: string;
    projectCostMinor: string;
    collectedMinor: string | null;
    reviewFlags: readonly string[];
  }>[];
  expenseCategories: readonly Readonly<{
    id: string;
    category: string;
    monthlyAmounts: readonly Readonly<{ period: string; amountMinor: string }>[];
    reviewFlags: readonly string[];
  }>[];
  workforce: Readonly<{
    payrollNetMinor: string;
    bonusMinor: string;
    payrollRowCount: number;
    bonusRowCount: number;
  }>;
  rows: readonly Readonly<{
    id: string;
    kind: WorkbookSourceControlKind;
    workbook: string;
    sheet: string;
    sourceRow: number;
    status: "pending_review" | "approved" | "posted";
    reviewFlags: readonly string[];
    mappedData: Readonly<Record<string, unknown>>;
  }>[];
}>;

export type OperatingDashboardReadModel = Readonly<{
  schemaVersion: 1;
  asOf: string;
  currency: string;
  backlog: Readonly<{
    projectCount: number;
    contractedMinor: string;
    invoicedMinor: string;
    remainingMinor: string;
    projects: readonly Record<string, unknown>[];
  }>;
  collections: Readonly<{
    receivablesMinor: string;
    creditSalesMinor: string;
    dsoDays: number | null;
    overdueMinor: string;
    dueWithin7DaysMinor: string;
    dueWithin30DaysMinor: string;
    laterMinor: string;
  }>;
  projectBurn: readonly Record<string, unknown>[];
  clientConcentration: Readonly<{
    totalRevenueMinor: string;
    topClientShareBps: number | null;
    topThreeShareBps: number | null;
    clients: readonly Record<string, unknown>[];
  }>;
  financials: Readonly<{
    revenueMinor: string;
    expenseMinor: string;
    netProfitMinor: string;
    unrestrictedCashMinor: string | null;
    bankAvailableMinor: string;
    cashOnHandMinor: string;
    cashAndBankMinor: string;
    ownerPayableMinor: string;
    ownerOperatingPayableMinor: string;
    netAvailableCashMinor: string;
    actualOwnerPaidCompanyCostMinor: string;
    netCompanyFundsMinor: string;
    unclassifiedOwnerPaidCount: number;
    unclassifiedOwnerPaidMinor: string;
    ownerPaidClassificationStatus: "ready" | "review_required" | "unconfigured";
    corporateIncomeTaxRateBps: number | null;
    rosBps: number | null;
    recognitionEventCount: number;
    approvedBudgetCount: number;
    postedOverheadRunCount: number;
    source: "posted_ledger";
    monthly: readonly Readonly<{
      period: string;
      revenueMinor: string;
      expenseMinor: string;
    }>[];
  }>;
  dataQuality: Readonly<{
    pendingCount: number;
    byFlag: readonly Readonly<{ flag: string; count: number }>[];
    rows: readonly Record<string, unknown>[];
  }>;
  sourceControls: WorkbookSourceControls;
}>;

export type OperatingDashboardStore = Readonly<{
  read(
    organizationId: string,
    query: OperatingDashboardQuery,
  ): Promise<OperatingDashboardReadModel>;
}>;

export const OPERATING_DASHBOARD_STORE = Symbol("OPERATING_DASHBOARD_STORE");
