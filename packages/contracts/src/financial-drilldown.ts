export const FINANCIAL_DRILLDOWN_CONTRACT_VERSION = 1 as const;

export type FinancialSourceResourceTypeContract =
  "journal_line" | "journal_entry" | "commercial_document" | "expense" | "evidence";

export type FinancialSourceRefContract = Readonly<{
  resourceType: FinancialSourceResourceTypeContract;
  id: string;
  href: string;
}>;

export type FinancialSourceResolutionContract = Readonly<{
  schemaVersion: typeof FINANCIAL_DRILLDOWN_CONTRACT_VERSION;
  journalId: string;
  lineNumber: number;
  amountMinor: string;
  refs: readonly FinancialSourceRefContract[];
}>;

export type FinancialStatementDrilldownItemContract = Readonly<{
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
  dimensions: Readonly<Record<string, string>>;
  sourceId: string;
  sourceType: "journal_entry";
  refs: readonly FinancialSourceRefContract[];
}>;
