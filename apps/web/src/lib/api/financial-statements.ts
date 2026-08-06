export type FinancialStatementKind =
  "profit_and_loss" | "balance_sheet" | "cash_flow" | "vat_reconciliation";

export type FinancialStatementLine = Readonly<{
  lineCode: string;
  label: string;
  amountMinor: string;
  displayOrder?: number;
  sourceLineCount?: number;
  sourceLineIds?: readonly string[];
  drillDown?: Readonly<{ statement: FinancialStatementKind; lineCode: string }>;
}>;

export type RawFinancialStatementReport =
  ProfitAndLossContract | BalanceSheetContract | DirectCashFlowContract | VatReconciliationContract;
export type RawTaxExpenseReview = TaxExpenseReviewContract &
  Readonly<{ items: readonly Record<string, unknown>[]; count: number; asOfInstant: string }>;

export type FinancialStatementReport = Readonly<{
  statement: FinancialStatementKind;
  basis: string;
  method?: string;
  range: Readonly<{ startsOn: string | null; endsOn: string }>;
  asOfInstant: string;
  framework: "TT133" | "TT200";
  formulaVersion?: string;
  mappingVersion: Readonly<{ id: string; version: number }>;
  status?: "ready" | "review_required" | "invalid";
  final: boolean;
  lines: readonly FinancialStatementLine[];
  totalMinor?: string;
  sourceFingerprint: string;
  sourceLineCount: number;
  unmappedAccountCodes?: readonly string[];
  equation?: Readonly<{
    assetsMinor: string;
    liabilitiesMinor: string;
    equityMinor: string;
    differenceMinor: string;
    balanced: boolean;
  }>;
  totals?: Readonly<{
    outputVatMinor?: string;
    inputVatMinor?: string;
    eligibleInputVatMinor?: string;
    ineligibleInputVatMinor?: string;
    unreviewedInputVatMinor?: string;
    netVatPayableMinor?: string;
  }>;
  controls?: Readonly<{
    unreviewedExpenseLineCount?: string;
    missingEvidenceExpenseCount?: string;
    differenceMinor?: string;
  }>;
  openingCashMinor?: string;
  operatingCashFlowMinor?: string;
  investingCashFlowMinor?: string;
  financingCashFlowMinor?: string;
  netCashMovementMinor?: string;
  closingCashMinor?: string;
  exceptions?: readonly Readonly<{
    code: string;
    journalId?: string;
    accountCodes?: readonly string[];
  }>[];
}>;

export type FinancialStatementDrilldown = Readonly<{
  statement: FinancialStatementKind;
  lineCode: string;
  count: number;
  sourceFingerprint: string;
  items: readonly Readonly<{
    journalId: string;
    journalVersion: string;
    journalDate: string;
    postedAt: string;
    lineNumber: number;
    accountCode: string;
    accountName: string;
    debitMinor: string;
    creditMinor: string;
    amountMinor: string;
    sourceId?: string;
    sourceType?: string;
    dimensions: Readonly<Record<string, string>>;
  }>[];
}>;

export type TaxExpenseException = Readonly<{
  id: string;
  expenseId: string;
  expenseDate: string;
  description: string;
  partyName?: string;
  bookedMinor: string;
  citEligibleMinor: string;
  citIneligibleMinor: string;
  vatEligibleMinor: string;
  vatIneligibleMinor: string;
  citState: string;
  vatState: string;
  evidenceState: string;
  reviewer?: string;
  reason?: string;
  sourceIds: readonly string[];
}>;

export const financialStatementsApi = Object.freeze({
  profitAndLoss: "reports/financial-statements/profit-and-loss",
  balanceSheet: "reports/financial-statements/balance-sheet",
  cashFlow: "reports/financial-statements/cash-flow",
  vatReconciliation: "reports/tax/vat-reconciliation",
  expenseExceptions: "reports/tax/expense-exceptions",
  drilldown: "reports/financial-statements/drilldown",
});
import type {
  BalanceSheetContract,
  DirectCashFlowContract,
  ProfitAndLossContract,
  TaxExpenseReviewContract,
  VatReconciliationContract,
} from "@naai-erp/contracts";
