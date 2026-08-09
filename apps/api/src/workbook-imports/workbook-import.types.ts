export interface ImportPartyInput {
  id: string;
  displayName: string;
  normalizedTaxId: string | null;
  status: "active" | "inactive";
  roles: readonly string[];
}

export interface ImportProjectInput {
  id: string;
  code: string;
  name: string;
  clientPartyId: string;
  ownerUserId: string;
  contractType: "fixed_fee" | "time_and_materials" | "retainer" | "internal";
  currency: string;
  budgetMinor: string;
  startsOn: string;
  endsOn: string | null;
  state: "planned" | "active" | "on_hold" | "completed" | "closed";
  /** Canonical JSON property used by first-party clients. */
  defaultServiceLineCode?: string | null;
  /** Backward-compatible workbook field name. */
  default_service_line_code?: string | null;
}

export interface ImportSalesInvoiceInput {
  id: string;
  documentNumber: string;
  partyId: string;
  projectId?: string;
  documentDate: string;
  dueDate: string;
  currency: string;
  netMinor: string;
  taxMinor: string;
  grossMinor: string;
  controlAccountCode: string;
  sourceRowIndex: number;
  sourceIdentity: string;
  legacyControlTreatment?: LegacyControlTreatment;
}

export interface ImportExpenseInput {
  id: string;
  amountMinor: string;
  taxMinor: string;
  date: string;
  class: string;
  categoryCode?: string;
  categoryLabel?: string;
  supplierDisplayName?: string | null;
  payeePartyId: string | null;
  businessPurpose: string;
  currency: string;
  sourceRowIndex: number;
  sourceIdentity: string;
  projectId?: string;
  sourceMetadata?: Readonly<{
    manualCost?: string;
    cashMinor?: string | null;
    vatRate?: string;
    invoiceDate?: string;
    department?: string;
    fundingSource?: string;
    monthLabel?: string;
    invoiceFile?: string;
    sourceExpenseType?: string;
    supplierDisplayName?: string | null;
    supplierInferenceSource?: "personnel" | "note" | "category_default" | "unresolved";
    categoryCode?: string;
    categoryLabel?: string;
    categoryInferenceSource?: "expense_type" | "note" | "fallback";
  }>;
  legacyControlTreatment?: LegacyControlTreatment;
}

export interface LegacyControlTreatment {
  sourceSheet: string;
  sourceRow: number;
  controlYear: number;
  controlMonth: number | null;
  included: boolean;
  classification?: string;
  evidence?: string;
}

export type WorkbookImportReviewStatus = "pending_review" | "approved" | "ignored" | "posted";

export interface WorkbookSourceControlReference {
  workbook: string;
  sheet: string;
  row: number;
}

export interface WorkbookMonthlyControlAmount {
  period: string;
  amountMinor: string;
}

export interface WorkbookControlMappedData {
  sourceControl: WorkbookSourceControlReference;
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
  monthlyAmounts?: readonly WorkbookMonthlyControlAmount[];
}

export interface WorkbookImportReviewRowInput {
  id: string;
  sourceIdentity: string;
  workbook: string;
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
    | "workforce_profile_pending"
    | "expense_category_control";
  proposedResourceId?: string;
  status: "pending_review" | "posted" | "ignored";
  reviewFlags: readonly string[];
  rawData: Readonly<Record<string, unknown>>;
  mappedData: Readonly<Record<string, unknown>> | Readonly<WorkbookControlMappedData>;
}

export interface UpdateWorkbookImportReviewRowInput {
  mappedData?: Readonly<Record<string, unknown>>;
  resolution?: Readonly<Record<string, unknown>>;
  status?: WorkbookImportReviewStatus;
  notes?: string | null;
}

export interface WorkbookImportPayload {
  mappingVersion: 1 | 2 | 3;
  sources: readonly Readonly<{ kind: "projects" | "finance"; sha256: string; filename: string }>[];
  inventory: readonly Readonly<{
    workbook: string;
    sheet: string;
    rowCount: number;
    dataRowCount: number;
    formulaCellCount: number;
    disposition: "projects" | "sales" | "expenses" | "control" | "reference";
  }>[];
  issues: readonly Readonly<{
    severity: "error" | "warning";
    workbook: string;
    sheet: string;
    row?: number;
    field?: string;
    message: string;
  }>[];
  controls: readonly Readonly<{
    workbook: string;
    sheet: string;
    year: number;
    salesMinor: string;
    expenseMinor: string;
    profitMinor: string;
  }>[];
  varianceRules: readonly Readonly<{
    id: string;
    mappingVersion: 1 | 2 | 3;
    sheet: string;
    metric: "sales" | "expense" | "profit";
    varianceMinor: string;
    classification: string;
  }>[];
  parties: readonly ImportPartyInput[];
  projects: readonly ImportProjectInput[];
  salesInvoices: readonly ImportSalesInvoiceInput[];
  expenses: readonly ImportExpenseInput[];
  reviewRows?: readonly WorkbookImportReviewRowInput[];
}
