export const FINANCIAL_STATEMENT_CONTRACT_VERSION = 1 as const;
export const PROFIT_AND_LOSS_FORMULA_VERSION = "profit-and-loss-v1" as const;
export const BALANCE_SHEET_FORMULA_VERSION = "balance-sheet-v1" as const;
export const DIRECT_CASH_FLOW_FORMULA_VERSION = "direct-cash-flow-v1" as const;
export const FINANCIAL_LEDGER_CONTROL_VERSION = "ledger-control-v1" as const;

export type FinancialReportStatusContract = "ready" | "review_required";
export type ProfitAndLossSectionContract =
  "revenue" | "direct_cost" | "operating_expense" | "other_income" | "other_expense" | "income_tax";
export type CashFlowSectionContract =
  "operating" | "investing" | "financing" | "internal_transfer" | "unclassified";

export type LedgerCutoffContract = Readonly<{
  throughDate: string;
  maxPostedAt: string;
  journalCount: number;
  lineCount: number;
  sourceFingerprint: string;
}>;
export type FinancialStatementRowContract = Readonly<{
  key: string;
  label: string;
  amountMinor: string;
  accountIds: readonly string[];
  journalIds: readonly string[];
  journalLineIds: readonly string[];
  sourceIds: readonly string[];
  mappingVersionIds: readonly string[];
}>;
export type FinancialControlContract = Readonly<{
  controlVersion: typeof FINANCIAL_LEDGER_CONTROL_VERSION;
  ledgerMinor: string;
  reportMinor: string;
  differenceMinor: string;
  status: "tied_out" | "difference";
}>;

export type FinancialReportQueryContract = Readonly<{
  periodId?: string;
  startsOn?: string;
  endsOn?: string;
  asOfDate?: string;
  framework?: "TT133" | "TT200";
  teamId?: string;
  serviceLineCode?: string;
  ownerId?: string;
  projectId?: string;
}>;

export type ProfitAndLossContract = Readonly<{
  schemaVersion: typeof FINANCIAL_STATEMENT_CONTRACT_VERSION;
  organizationId: string;
  currency: string;
  startsOn: string;
  endsOn: string;
  accountingBasis: "accrual_management";
  formulaVersion: typeof PROFIT_AND_LOSS_FORMULA_VERSION;
  ledgerCutoff: LedgerCutoffContract;
  status: FinancialReportStatusContract;
  revenueMinor: string;
  directCostMinor: string;
  grossProfitMinor: string;
  operatingExpenseMinor: string;
  operatingProfitMinor: string;
  otherIncomeMinor: string;
  otherExpenseMinor: string;
  profitBeforeTaxMinor: string;
  incomeTaxMinor: string;
  sectionFormulaNetProfitMinor: string;
  netProfitMinor: string;
  unclassifiedNetMinor: string;
  rows: readonly FinancialStatementRowContract[];
  unclassifiedRows: readonly FinancialStatementRowContract[];
  control: FinancialControlContract;
  confidenceFlags: readonly Readonly<{
    code: "unclassified_profit_and_loss";
    severity: "critical";
    sourceIds: readonly string[];
  }>[];
}>;

export type BalanceSheetContract = Readonly<{
  schemaVersion: typeof FINANCIAL_STATEMENT_CONTRACT_VERSION;
  organizationId: string;
  currency: string;
  asOfDate: string;
  formulaVersion: typeof BALANCE_SHEET_FORMULA_VERSION;
  ledgerCutoff: LedgerCutoffContract;
  assetsMinor: string;
  liabilitiesMinor: string;
  ledgerEquityMinor: string;
  unclosedEarningsMinor: string;
  totalEquityMinor: string;
  liabilitiesAndEquityMinor: string;
  equationDifferenceMinor: string;
  assetRows: readonly FinancialStatementRowContract[];
  liabilityRows: readonly FinancialStatementRowContract[];
  equityRows: readonly FinancialStatementRowContract[];
  earningsRows: readonly FinancialStatementRowContract[];
  control: FinancialControlContract;
}>;

export type DirectCashFlowContract = Readonly<{
  schemaVersion: typeof FINANCIAL_STATEMENT_CONTRACT_VERSION;
  organizationId: string;
  currency: string;
  startsOn: string;
  endsOn: string;
  formulaVersion: typeof DIRECT_CASH_FLOW_FORMULA_VERSION;
  ledgerCutoff: LedgerCutoffContract;
  status: FinancialReportStatusContract;
  openingCashMinor: string;
  operatingCashFlowMinor: string;
  investingCashFlowMinor: string;
  financingCashFlowMinor: string;
  unclassifiedCashFlowMinor: string;
  netCashFlowMinor: string;
  closingCashMinor: string;
  expectedClosingCashMinor: string;
  movements: readonly FinancialStatementRowContract[];
  internalTransferJournalIds: readonly string[];
  control: FinancialControlContract;
  confidenceFlags: readonly Readonly<{
    code: "unclassified_cash_flow";
    severity: "critical";
    sourceIds: readonly string[];
  }>[];
}>;
