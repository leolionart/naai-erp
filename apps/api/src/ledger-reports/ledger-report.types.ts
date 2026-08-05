import type { JournalActorContext, JournalLineInput } from "../journals/journal.types.js";

export type LedgerReportContext = JournalActorContext;

export type ReportRange = Readonly<{
  from?: string;
  to?: string;
  accountCode?: string;
}>;

export type OpeningBalanceInput = Readonly<{
  importId?: string;
  openingDate: string;
  currency: string;
  description: string;
  controlDebitMinor: string;
  controlCreditMinor: string;
  lines: readonly JournalLineInput[];
}>;
