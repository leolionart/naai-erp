import type { JournalActorContext } from "../journals/journal.types.js";

export type FinancialStatementContext = JournalActorContext;
export type StatementKind =
  "profit_and_loss" | "balance_sheet" | "cash_flow" | "vat_reconciliation";
export type StatementQuery = Readonly<{
  startsOn?: string;
  endsOn: string;
  asOfInstant: string;
  framework: "TT133" | "TT200";
  basis: "accrual" | "cash";
  dimensions: Record<string, string>;
}>;
export type DrilldownQuery = StatementQuery &
  Readonly<{ statement: StatementKind; lineCode: string }>;
export type MappingLineInput = Readonly<{
  statement: StatementKind;
  lineCode: string;
  label: string;
  accountCode: string;
  displayOrder: number;
  sign?: -1 | 1;
  cashFlowClass?: "operating" | "investing" | "financing" | "non_cash";
  vatTreatment?: "output" | "input_eligible" | "input_ineligible";
}>;
export type MappingInput = Readonly<{
  id?: string;
  version?: number;
  framework: "TT133" | "TT200";
  effectiveFrom: string;
  effectiveTo?: string | null;
  changeReason: string;
  reportPolicy?: Readonly<{
    maxLedgerDifferenceMinor: string;
    maxUnreviewedInputMinor: string;
    maxUnresolvedItemCount: number;
    maxMissingEvidenceCount: number;
  }>;
  lines: readonly MappingLineInput[];
}>;
export type FinancialStatementStore = Readonly<{
  listMappings(c: FinancialStatementContext): Promise<unknown>;
  getMapping(c: FinancialStatementContext, id: string, version?: number): Promise<unknown>;
  createMapping(c: FinancialStatementContext, input: MappingInput, key: string): Promise<unknown>;
  approveMapping(
    c: FinancialStatementContext,
    id: string,
    version: number,
    reason: string,
    key: string,
  ): Promise<unknown>;
  report(c: FinancialStatementContext, kind: StatementKind, q: StatementQuery): Promise<unknown>;
  drilldown(c: FinancialStatementContext, q: DrilldownQuery): Promise<unknown>;
  expenseExceptions(
    c: FinancialStatementContext,
    q: StatementQuery,
    state?: string,
  ): Promise<unknown>;
  resolveSource(
    c: FinancialStatementContext,
    journalId: string,
    lineNumber: number,
  ): Promise<unknown>;
}>;
export const FINANCIAL_STATEMENT_STORE = Symbol("FINANCIAL_STATEMENT_STORE");
