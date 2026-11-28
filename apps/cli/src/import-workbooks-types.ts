export type SourceIssue = Readonly<{
  severity: "error" | "warning";
  workbook: string;
  sheet: string;
  row?: number;
  field?: string;
  message: string;
}>;

export type SheetInventory = Readonly<{
  workbook: string;
  sheet: string;
  rowCount: number;
  dataRowCount: number;
  formulaCellCount: number;
  disposition: "projects" | "sales" | "expenses" | "control" | "reference";
}>;

export type ControlTreatment = Readonly<{
  sourceSheet: "Doanh thu" | "Chi phí";
  sourceRow: number;
  controlYear: 2025;
  controlMonth: number | null;
  included: boolean;
  classification: string;
  evidence: string;
}>;

export type ImportedSalesInvoice = Record<string, unknown> &
  Readonly<{
    documentDate: string;
    netMinor: string;
    legacyControlTreatment: ControlTreatment;
  }>;

export type ImportedExpense = Record<string, unknown> &
  Readonly<{
    date: string;
    amountMinor: string;
    taxMinor: string;
    sourceMetadata: Readonly<{
      manualCost: string;
      cashMinor: string | null;
      vatRate: string;
      invoiceDate: string;
      department: string;
      fundingSource: string;
      monthLabel: string;
      invoiceFile: string;
      sourceExpenseType: string;
      supplierDisplayName: string | null;
      supplierInferenceSource: "personnel" | "note" | "category_default" | "unresolved";
      categoryCode: string;
      categoryLabel: string;
      categoryInferenceSource: "expense_type" | "note" | "fallback";
    }>;
    legacyControlTreatment: ControlTreatment;
  }>;

export type ReviewRow = Readonly<{
  id: string;
  sourceIdentity: string;
  workbook: "projects" | "finance";
  sheet: string;
  row: number;
  kind:
    | "project"
    | "sales"
    | "expense"
    | "owner_movement"
    | "debt_control"
    | "profitability_control"
    | "planning_control"
    | "bonus_control"
    | "payroll_master"
    | "expense_category_control";
  proposedResourceType:
    | "project"
    | "sales_invoice"
    | "purchase_invoice"
    | "owner_equity_or_transfer_pending"
    | "ar_control"
    | "profitability_control"
    | "planning_control"
    | "bonus_control"
    | "payroll_control_pending"
    | "expense_category_control";
  proposedResourceId?: string;
  status: "pending_review" | "posted" | "ignored";
  reviewFlags: string[];
  rawData: Record<string, unknown>;
  mappedData: Record<string, unknown>;
}>;

export type WorkbookControlMappedData = Readonly<{
  sourceControl: Readonly<{ workbook: "finance"; sheet: string; row: number }>;
  period?: string | undefined;
  projectLabel?: string;
  personName?: string;
  category?: string;
  debtMinor?: string;
  projectCostMinor?: string;
  collectedMinor?: string | null;
  revenueMinor?: string;
  receivedMinor?: string;
  expenseMinor?: string;
  profitMinor?: string;
  forecastExpenseMinor?: string | null;
  forecastCashMinor?: string | null;
  targetAttainmentBps?: number | null;
  bonusMinor?: string;
  payrollNetMinor?: string;
  employmentStatus?: string;
  department?: string;
  tenure?: string;
  employmentType?: string;
  hireDate?: string | null;
  monthlyAmounts?: readonly Readonly<{ period: string; amountMinor: string }>[];
}>;

export type ExpenseCategoryInference = Readonly<{
  code: string;
  label: string;
  source: "expense_type" | "note" | "fallback";
}>;

export type ImportedParty = {
  id: string;
  displayName: string;
  normalizedTaxId: null;
  status: "active";
  roles: string[];
};

export type ReviewSourceEntry = {
  workbook: "projects" | "finance";
  sheet: string;
  row: number;
  hash: string;
  kind: ReviewRow["kind"];
  rawData: Record<string, unknown>;
};

export type WorkbookControlTotal = {
  workbook: string;
  sheet: string;
  year: number;
  salesMinor: string;
  expenseMinor: string;
  profitMinor: string;
};

export type WorkbookSourceRecord = {
  kind: "projects" | "finance";
  sha256: string;
  filename: string;
};

export type WorkbookImportAccumulator = {
  issues: SourceIssue[];
  inventory: SheetInventory[];
  parties: Map<string, ImportedParty>;
  projects: Record<string, unknown>[];
  projectsBySourceRow: Map<number, Record<string, unknown>>;
  salesInvoices: ImportedSalesInvoice[];
  expenses: ImportedExpense[];
  reviewSources: ReviewSourceEntry[];
  controlResourceTypes: Map<ReviewRow["kind"], ReviewRow["proposedResourceType"]>;
  controls: WorkbookControlTotal[];
  sources: WorkbookSourceRecord[];
  party: (name: string, role: "client" | "supplier") => string;
};
