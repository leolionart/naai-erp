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
  payeePartyId: string | null;
  businessPurpose: string;
  currency: string;
  sourceRowIndex: number;
  sourceIdentity: string;
  projectId?: string;
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

export interface WorkbookImportPayload {
  mappingVersion: 1 | 2;
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
    mappingVersion: 1 | 2;
    sheet: string;
    metric: "sales" | "expense" | "profit";
    varianceMinor: string;
    classification: string;
  }>[];
  parties: readonly ImportPartyInput[];
  projects: readonly ImportProjectInput[];
  salesInvoices: readonly ImportSalesInvoiceInput[];
  expenses: readonly ImportExpenseInput[];
}
