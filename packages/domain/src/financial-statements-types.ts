export const PROFIT_AND_LOSS_FORMULA_VERSION = "profit-and-loss-v1" as const;
export const BALANCE_SHEET_FORMULA_VERSION = "balance-sheet-v1" as const;
export const DIRECT_CASH_FLOW_FORMULA_VERSION = "direct-cash-flow-v1" as const;
export const FINANCIAL_LEDGER_CONTROL_VERSION = "ledger-control-v1" as const;

export type FinancialReportStatus = "ready" | "review_required";
export type FinancialRootType = "asset" | "liability" | "equity" | "revenue" | "expense";
export type ProfitAndLossSection =
  "revenue" | "direct_cost" | "operating_expense" | "other_income" | "other_expense" | "income_tax";
export type CashFlowSection =
  "operating" | "investing" | "financing" | "internal_transfer" | "unclassified";
export type CashFlowSourceKind =
  | "customer_receipt"
  | "supplier_payment"
  | "employee_payment"
  | "tax_payment"
  | "asset_purchase"
  | "asset_sale"
  | "capital_contribution"
  | "loan_proceeds"
  | "loan_repayment"
  | "owner_withdrawal"
  | "internal_transfer"
  | "other";

export type LedgerCutoff = Readonly<{
  throughDate: string;
  maxPostedAt: string;
  journalCount: number;
  lineCount: number;
  sourceFingerprint: string;
}>;

export type FinancialLedgerLine = Readonly<{
  id: string;
  organizationId: string;
  journalId: string;
  entryDate: string;
  accountId: string;
  accountName: string;
  rootType: FinancialRootType;
  debitMinor: bigint;
  creditMinor: bigint;
  description?: string;
  sourceId: string;
  sourceType: string;
  dimensions: Readonly<Record<string, string>>;
  pnlSection?: ProfitAndLossSection;
  mappingVersionId?: string;
}>;

export type FinancialStatementRow = Readonly<{
  key: string;
  label: string;
  amountMinor: bigint;
  accountIds: readonly string[];
  journalIds: readonly string[];
  journalLineIds: readonly string[];
  sourceIds: readonly string[];
  mappingVersionIds: readonly string[];
}>;

export type FinancialControl = Readonly<{
  controlVersion: typeof FINANCIAL_LEDGER_CONTROL_VERSION;
  ledgerMinor: bigint;
  reportMinor: bigint;
  differenceMinor: bigint;
  status: "tied_out" | "difference";
}>;

export type ProfitAndLoss = Readonly<{
  organizationId: string;
  currency: string;
  startsOn: string;
  endsOn: string;
  accountingBasis: "accrual_management";
  formulaVersion: typeof PROFIT_AND_LOSS_FORMULA_VERSION;
  ledgerCutoff: LedgerCutoff;
  status: FinancialReportStatus;
  revenueMinor: bigint;
  directCostMinor: bigint;
  grossProfitMinor: bigint;
  operatingExpenseMinor: bigint;
  operatingProfitMinor: bigint;
  otherIncomeMinor: bigint;
  otherExpenseMinor: bigint;
  profitBeforeTaxMinor: bigint;
  incomeTaxMinor: bigint;
  sectionFormulaNetProfitMinor: bigint;
  netProfitMinor: bigint;
  unclassifiedNetMinor: bigint;
  rows: readonly FinancialStatementRow[];
  unclassifiedRows: readonly FinancialStatementRow[];
  control: FinancialControl;
  confidenceFlags: readonly Readonly<{
    code: "unclassified_profit_and_loss";
    severity: "critical";
    sourceIds: readonly string[];
  }>[];
}>;

export type BalanceSheet = Readonly<{
  organizationId: string;
  currency: string;
  asOfDate: string;
  formulaVersion: typeof BALANCE_SHEET_FORMULA_VERSION;
  ledgerCutoff: LedgerCutoff;
  assetsMinor: bigint;
  liabilitiesMinor: bigint;
  ledgerEquityMinor: bigint;
  unclosedEarningsMinor: bigint;
  totalEquityMinor: bigint;
  liabilitiesAndEquityMinor: bigint;
  equationDifferenceMinor: bigint;
  assetRows: readonly FinancialStatementRow[];
  liabilityRows: readonly FinancialStatementRow[];
  equityRows: readonly FinancialStatementRow[];
  earningsRows: readonly FinancialStatementRow[];
  control: FinancialControl;
}>;

export type CashFlowJournal = Readonly<{
  journalId: string;
  entryDate: string;
  sourceId: string;
  sourceKind: CashFlowSourceKind;
  classification: CashFlowSection;
  mappingVersionId?: string;
  lines: readonly FinancialLedgerLine[];
}>;

export type DirectCashFlow = Readonly<{
  organizationId: string;
  currency: string;
  startsOn: string;
  endsOn: string;
  formulaVersion: typeof DIRECT_CASH_FLOW_FORMULA_VERSION;
  ledgerCutoff: LedgerCutoff;
  status: FinancialReportStatus;
  openingCashMinor: bigint;
  operatingCashFlowMinor: bigint;
  investingCashFlowMinor: bigint;
  financingCashFlowMinor: bigint;
  unclassifiedCashFlowMinor: bigint;
  netCashFlowMinor: bigint;
  closingCashMinor: bigint;
  expectedClosingCashMinor: bigint;
  movements: readonly FinancialStatementRow[];
  internalTransferJournalIds: readonly string[];
  control: FinancialControl;
  confidenceFlags: readonly Readonly<{
    code: "unclassified_cash_flow";
    severity: "critical";
    sourceIds: readonly string[];
  }>[];
}>;
