import type {
  ExpenseBreakdownReportContract,
  ExpenseReportCurrencySeriesContract,
  ExpenseReportGroupContract,
} from "@naai-erp/contracts";

export const expenseBreakdownReportApi = Object.freeze({
  byPayee: "reports/expenses/by-payee",
  byCategory: "reports/expenses/by-category",
});

export type ExpenseBreakdownKind = "payee" | "category";
export type ExpenseBreakdownReport = ExpenseBreakdownReportContract;
export type ExpenseBreakdownCurrencySeries = ExpenseReportCurrencySeriesContract;
export type ExpenseBreakdownGroup = ExpenseReportGroupContract;
