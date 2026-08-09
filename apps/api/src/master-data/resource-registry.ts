export type ResourceDefinition = Readonly<{
  table: string;
  organizationColumn: string;
  keyColumns: readonly string[];
  writableColumns: readonly string[];
  mutableColumns: readonly string[];
  deactivate?: Readonly<{ column: string; value: string | boolean }>;
  versionColumn?: string;
  deletePolicy?: Readonly<{
    relationalReferences: readonly Readonly<{ table: string; column: string }>[];
    dimensionReferences: readonly string[];
  }>;
}>;

export const PROJECT_DELETE_RELATIONAL_REFERENCES = [
  { table: "timesheet_entries", column: "project_id" },
  { table: "project_cost_items", column: "project_id" },
  { table: "direct_cost_allocation_splits", column: "project_id" },
  { table: "contracts", column: "project_id" },
  { table: "scope_changes", column: "project_id" },
  { table: "project_budget_versions", column: "project_id" },
  { table: "revenue_recognition_policies", column: "project_id" },
  { table: "revenue_recognition_events", column: "project_id" },
  { table: "overhead_allocation_splits", column: "project_id" },
] as const;

export const PROJECT_DELETE_DIMENSION_REFERENCES = [
  "journal_lines",
  "commercial_document_lines",
  "commercial_document_allocations",
  "expense_lines",
  "expense_allocations",
  "forecast_components",
  "planning_actual_facts",
  "roi_input_facts",
] as const;

export const MASTER_DATA_RESOURCES = {
  organizations: {
    table: "organizations",
    organizationColumn: "id",
    keyColumns: ["id"],
    writableColumns: [],
    mutableColumns: ["legal_name", "tax_id", "registered_address", "base_currency", "timezone"],
  },
  "fiscal-years": {
    table: "fiscal_years",
    organizationColumn: "organization_id",
    keyColumns: ["year"],
    writableColumns: ["year", "starts_on", "ends_on"],
    mutableColumns: ["starts_on", "ends_on"],
  },
  "fiscal-periods": {
    table: "fiscal_periods",
    organizationColumn: "organization_id",
    keyColumns: ["fiscal_year", "period_number"],
    writableColumns: ["fiscal_year", "period_number", "starts_on", "ends_on"],
    mutableColumns: ["starts_on", "ends_on"],
  },
  "exchange-rates": {
    table: "exchange_rates",
    organizationColumn: "organization_id",
    keyColumns: ["id"],
    writableColumns: ["id", "source_currency", "target_currency", "rate", "source", "observed_at"],
    mutableColumns: [],
  },
  accounts: {
    table: "accounts",
    organizationColumn: "organization_id",
    keyColumns: ["code"],
    writableColumns: [
      "code",
      "name",
      "root_type",
      "is_control_account",
      "allow_manual_posting",
      "is_active",
    ],
    mutableColumns: ["name", "is_control_account", "allow_manual_posting", "is_active"],
    deactivate: { column: "is_active", value: false },
  },
  "statutory-mappings": {
    table: "statutory_account_mappings",
    organizationColumn: "organization_id",
    keyColumns: ["account_code", "framework", "effective_from"],
    writableColumns: [
      "account_code",
      "framework",
      "statutory_code",
      "effective_from",
      "effective_to",
      "approved_by",
      "approved_at",
    ],
    mutableColumns: [],
  },
  "tax-code-versions": {
    table: "tax_code_versions",
    organizationColumn: "organization_id",
    keyColumns: ["code", "effective_from"],
    writableColumns: [
      "code",
      "name",
      "kind",
      "rate",
      "effective_from",
      "effective_to",
      "review_state",
      "required_evidence",
      "reviewed_by",
      "reviewed_at",
      "review_reason",
    ],
    mutableColumns: [
      "name",
      "effective_to",
      "review_state",
      "required_evidence",
      "reviewed_by",
      "reviewed_at",
      "review_reason",
    ],
  },
  dimensions: {
    table: "dimension_values",
    organizationColumn: "organization_id",
    keyColumns: ["kind", "code"],
    writableColumns: ["kind", "code", "name", "is_active"],
    mutableColumns: ["name", "is_active"],
    deactivate: { column: "is_active", value: false },
  },
  "expense-categories": {
    table: "expense_categories",
    organizationColumn: "organization_id",
    keyColumns: ["code"],
    writableColumns: ["code", "name", "funding_treatment", "is_active"],
    mutableColumns: ["name", "funding_treatment", "is_active"],
    deactivate: { column: "is_active", value: false },
    versionColumn: "version",
  },
  "purchase-products": {
    table: "purchase_products",
    organizationColumn: "organization_id",
    keyColumns: ["code"],
    writableColumns: ["code", "name", "vat_rate_percent", "is_active"],
    mutableColumns: ["name", "vat_rate_percent", "is_active"],
    deactivate: { column: "is_active", value: false },
    versionColumn: "version",
  },
  "dimension-requirements": {
    table: "dimension_requirement_versions",
    organizationColumn: "organization_id",
    keyColumns: ["account_code", "effective_from"],
    writableColumns: [
      "account_code",
      "required_kinds",
      "effective_from",
      "effective_to",
      "change_reason",
      "correlation_id",
      "created_by",
    ],
    mutableColumns: [],
  },
  "default-mappings": {
    table: "default_mapping_versions",
    organizationColumn: "organization_id",
    keyColumns: ["category_code", "effective_from"],
    writableColumns: [
      "category_code",
      "account_code",
      "tax_code",
      "tax_effective_from",
      "default_cost_center_code",
      "default_service_line_code",
      "effective_from",
      "effective_to",
      "change_reason",
      "correlation_id",
      "created_by",
    ],
    mutableColumns: [],
  },
  parties: {
    table: "parties",
    organizationColumn: "organization_id",
    keyColumns: ["id"],
    writableColumns: [
      "id",
      "display_name",
      "legal_name",
      "normalized_tax_id",
      "registered_address",
      "email",
      "phone",
      "website",
      "status",
    ],
    mutableColumns: [
      "display_name",
      "legal_name",
      "normalized_tax_id",
      "registered_address",
      "email",
      "phone",
      "website",
      "status",
    ],
    deactivate: { column: "status", value: "inactive" },
  },
  "party-roles": {
    table: "party_roles",
    organizationColumn: "organization_id",
    keyColumns: ["party_id", "role"],
    writableColumns: ["party_id", "role"],
    mutableColumns: [],
  },
  projects: {
    table: "projects",
    organizationColumn: "organization_id",
    keyColumns: ["id"],
    writableColumns: [
      "id",
      "code",
      "name",
      "client_party_id",
      "owner_user_id",
      "contract_type",
      "currency",
      "budget_minor",
      "default_service_line_code",
      "starts_on",
      "ends_on",
      "state",
    ],
    mutableColumns: [
      "name",
      "client_party_id",
      "owner_user_id",
      "budget_minor",
      "default_service_line_code",
      "ends_on",
      "state",
    ],
    deletePolicy: {
      relationalReferences: PROJECT_DELETE_RELATIONAL_REFERENCES,
      dimensionReferences: PROJECT_DELETE_DIMENSION_REFERENCES,
    },
  },
  contracts: {
    table: "contracts",
    organizationColumn: "organization_id",
    keyColumns: ["id"],
    writableColumns: ["id", "project_id", "reference", "signed_on", "value_minor", "currency"],
    mutableColumns: ["reference", "signed_on", "value_minor"],
  },
  milestones: {
    table: "milestones",
    organizationColumn: "organization_id",
    keyColumns: ["id"],
    writableColumns: ["id", "contract_id", "name", "due_on", "amount_minor", "sequence"],
    mutableColumns: ["name", "due_on", "amount_minor", "sequence"],
  },
  "posting-rule-versions": {
    table: "posting_rule_versions",
    organizationColumn: "organization_id",
    keyColumns: ["rule_id", "version"],
    writableColumns: [
      "rule_id",
      "version",
      "name",
      "document_type",
      "priority",
      "effective_from",
      "effective_to",
      "status",
      "conditions",
      "line_templates",
      "change_reason",
      "correlation_id",
      "created_by",
    ],
    mutableColumns: [],
  },
  "accounting-workflow-policy": {
    table: "accounting_workflow_policies",
    organizationColumn: "organization_id",
    keyColumns: ["organization_id"],
    writableColumns: [
      "operating_mode",
      "allow_self_approval",
      "self_approval_max_minor",
      "soft_lock_posting_roles",
      "updated_by",
    ],
    mutableColumns: [
      "operating_mode",
      "allow_self_approval",
      "self_approval_max_minor",
      "soft_lock_posting_roles",
      "updated_by",
    ],
  },
} as const satisfies Record<string, ResourceDefinition>;

export type MasterDataResource = keyof typeof MASTER_DATA_RESOURCES;

export function resourceDefinition(resource: string): ResourceDefinition {
  const definition = MASTER_DATA_RESOURCES[resource as MasterDataResource];
  if (!definition) throw new Error(`Unknown master-data resource: ${resource}`);
  return definition;
}

export function encodeResourceKey(key: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(key)).toString("base64url");
}

export function decodeResourceKey(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Invalid resource key");
  return parsed as Record<string, unknown>;
}
