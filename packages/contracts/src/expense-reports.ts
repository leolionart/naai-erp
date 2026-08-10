export const EXPENSE_REPORT_CONTRACT_VERSION = "2026-08-10" as const;

export type ExpenseReportQueryContract = Readonly<{
  startsOn: string;
  endsOn: string;
}>;

export type ExpenseReportMonthlyValueContract = Readonly<{
  month: string;
  netMinor: string;
  vatMinor: string;
  grossMinor: string;
  amountMinor: string;
  sourceCount: string;
}>;

export type ExpenseReportGroupContract = Readonly<{
  key: string | null;
  name: string;
  monthly: readonly ExpenseReportMonthlyValueContract[];
  netMinor: string;
  vatMinor: string;
  grossMinor: string;
  totalMinor: string;
  sourceCount: string;
  drillDown: Readonly<Record<string, string>>;
}>;

export type ExpenseReportCurrencySeriesContract = Readonly<{
  currency: string;
  months: readonly string[];
  groups: readonly ExpenseReportGroupContract[];
  netMinor: string;
  vatMinor: string;
  grossMinor: string;
  totalMinor: string;
  sourceCount: string;
  reconciliation: Readonly<{
    groupTotalMinor: string;
    sourceTotalMinor: string;
    differenceMinor: string;
  }>;
}>;

export type ExpenseBreakdownReportContract = Readonly<{
  contractVersion: typeof EXPENSE_REPORT_CONTRACT_VERSION;
  basis: "posted-expense-sources";
  dimension: "payee" | "category";
  startsOn: string;
  endsOn: string;
  seriesByCurrency: readonly ExpenseReportCurrencySeriesContract[];
}>;
