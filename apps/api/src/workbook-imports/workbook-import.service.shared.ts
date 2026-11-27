import type { WorkbookImportPayload } from "./workbook-import.types.js";

export const REVIEW_ROLES = new Set(["owner", "finance_admin", "accountant"]);

export type ImportOutcome = {
  valid: boolean;
  errors: readonly string[];
  issues: WorkbookImportPayload["issues"];
  reconciliation: {
    totalSales: string;
    totalExpense: string;
    totalProfit: string;
    controls: readonly Readonly<{
      sheet: string;
      year: number;
      salesMinor: string;
      expenseMinor: string;
      profitMinor: string;
    }>[];
    variances: readonly Readonly<{
      sheet: string;
      year: number;
      metric: "sales" | "expense" | "profit";
      detailMinor: string;
      controlMinor: string;
      varianceMinor: string;
      classifiedBy?: string;
    }>[];
    legacyControl?: Readonly<{
      totalSales: string;
      totalExpense: string;
      totalProfit: string;
      components: readonly Readonly<{
        kind: "sales" | "expense";
        sourceIdentity: string;
        sourceSheet: string;
        sourceRow: number;
        controlYear: number;
        controlMonth: number | null;
        amountMinor: string;
        included: boolean;
        classification?: string;
        evidence?: string;
      }>[];
    }>;
  };
  details?: {
    partiesCreated: number;
    projectsCreated: number;
    salesInvoicesCreated: number;
    expensesCreated: number;
    expensesSkipped: number;
    auditEventId: string;
  };
  coverage: {
    inventory: WorkbookImportPayload["inventory"];
    sourceRows: { projects: number; sales: number; expenses: number };
  };
};
