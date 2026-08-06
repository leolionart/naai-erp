import { sql } from "drizzle-orm";
import {
  boolean,
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const auditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const role = pgEnum("role", [
  "owner",
  "finance_admin",
  "accountant",
  "project_manager",
  "approver",
  "viewer",
  "integration",
]);

export const fiscalPeriodState = pgEnum("fiscal_period_state", [
  "open",
  "soft_locked",
  "hard_locked",
]);

export const accountRootType = pgEnum("account_root_type", [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
]);

export const statutoryFramework = pgEnum("statutory_framework", ["TT133", "TT200"]);
export const taxKind = pgEnum("tax_kind", [
  "vat_input",
  "vat_output",
  "cit",
  "withholding",
  "other",
]);
export const taxReviewState = pgEnum("tax_review_state", [
  "draft",
  "accountant_approved",
  "retired",
]);
export const dimensionKind = pgEnum("dimension_kind", [
  "cost_center",
  "service_line",
  "category",
  "client",
  "project",
  "contract",
]);
export const partyRole = pgEnum("party_role", ["client", "supplier", "freelancer", "employee"]);
export const partyStatus = pgEnum("party_status", ["active", "inactive", "merged"]);
export const projectState = pgEnum("project_state", [
  "planned",
  "active",
  "on_hold",
  "completed",
  "closed",
]);
export const contractType = pgEnum("contract_type", [
  "fixed_fee",
  "time_and_materials",
  "retainer",
  "internal",
]);
export const journalState = pgEnum("journal_state", ["draft", "approved", "posted", "reversed"]);
export const postingRuleStatus = pgEnum("posting_rule_status", ["draft", "active", "retired"]);
export const targetPeriodKind = pgEnum("target_period_kind", ["month", "quarter", "year"]);
export const planningActualBasis = pgEnum("planning_actual_basis", [
  "recognized",
  "invoiced",
  "collected",
]);
export const planningVersionState = pgEnum("planning_version_state", [
  "draft",
  "published",
  "superseded",
]);
export const forecastScenario = pgEnum("forecast_scenario", ["base", "best", "worst", "custom"]);
export const forecastSnapshotKind = pgEnum("forecast_snapshot_kind", ["working", "month_end"]);
export const forecastComponentSection = pgEnum("forecast_component_section", [
  "revenue",
  "expense",
  "cash",
]);
export const forecastComponentDirection = pgEnum("forecast_component_direction", [
  "increase",
  "decrease",
]);
export const commercialDocumentType = pgEnum("commercial_document_type", [
  "sales_invoice",
  "purchase_invoice",
  "credit_note",
]);
export const commercialDocumentState = pgEnum("commercial_document_state", [
  "draft",
  "captured",
  "validated",
  "verified",
  "approved",
  "issued",
  "posted",
  "partially_paid",
  "paid",
  "cancelled",
]);
export const expenseClass = pgEnum("expense_class", [
  "invoice_backed",
  "receipt_backed",
  "contract_backed",
  "payroll_personnel",
  "bank_fee",
  "tax_payment",
  "non_documented",
  "owner_personal",
  "prepaid_asset",
  "fixed_asset",
  "employee_reimbursement",
  "freelancer",
  "platform_fee",
  "overseas_vendor",
  "petty_cash",
]);
export const expenseState = pgEnum("expense_state", [
  "draft",
  "submitted",
  "evidence_pending",
  "approved",
  "rejected",
  "posted",
]);
export const eligibilityState = pgEnum("eligibility_state", [
  "unreviewed",
  "eligible",
  "partially_eligible",
  "ineligible",
  "accountant_override",
]);
export const managementValidityState = pgEnum("management_validity_state", [
  "unreviewed",
  "valid",
  "invalid",
  "accountant_override",
]);
export const evidenceVersionStatus = pgEnum("evidence_version_status", [
  "active",
  "superseded",
  "quarantined",
]);
export const evidenceReviewState = pgEnum("evidence_review_state", [
  "pending",
  "accepted",
  "rejected",
  "needs_review",
]);
export const inboundMessageState = pgEnum("inbound_message_state", [
  "received",
  "processed",
  "quarantined",
  "retry_scheduled",
  "dead_letter",
]);
export const inboundAttemptOutcome = pgEnum("inbound_attempt_outcome", [
  "processed",
  "quarantined",
  "retryable_failure",
  "dead_letter",
]);
export const outboundSubscriptionStatus = pgEnum("outbound_subscription_status", [
  "active",
  "paused",
  "disabled",
]);
export const outboundDeliveryState = pgEnum("outbound_delivery_state", [
  "pending",
  "leased",
  "retry_scheduled",
  "delivered",
  "dead_letter",
]);
export const outboundAttemptOutcome = pgEnum("outbound_attempt_outcome", [
  "delivered",
  "retryable_failure",
  "permanent_failure",
  "lease_expired",
]);
export const financialAccountKind = pgEnum("financial_account_kind", ["bank", "cash"]);
export const financialAccountStatus = pgEnum("financial_account_status", ["active", "inactive"]);
export const bankTransactionState = pgEnum("bank_transaction_state", [
  "imported",
  "suggested",
  "matched",
  "reconciled",
  "ignored",
  "needs_review",
]);
export const bankImportRowOutcome = pgEnum("bank_import_row_outcome", [
  "imported",
  "duplicate",
  "rejected",
]);
export const bankStatementSessionState = pgEnum("bank_statement_session_state", [
  "draft",
  "reviewed",
  "closed",
]);
export const bankControlExceptionKind = pgEnum("bank_control_exception_kind", [
  "suspense",
  "control",
]);
export const bankControlExceptionStatus = pgEnum("bank_control_exception_status", [
  "pending",
  "approved",
  "resolved",
  "rejected",
]);
export const reconciliationAttemptState = pgEnum("reconciliation_attempt_state", [
  "matched",
  "reconciled",
  "unreconciled",
]);
export const reconciliationTargetType = pgEnum("reconciliation_target_type", [
  "commercial_document",
  "expense",
]);
export const reconciliationCandidateStatus = pgEnum("reconciliation_candidate_status", [
  "proposed",
  "accepted",
  "rejected",
]);
export const reconciliationAdjustmentKind = pgEnum("reconciliation_adjustment_kind", [
  "bank_fee",
  "fx_gain",
  "fx_loss",
  "suspense",
]);
export const journalSide = pgEnum("journal_side", ["debit", "credit"]);
export const internalTransferState = pgEnum("internal_transfer_state", [
  "pending_counterpart",
  "matched",
  "reconciled",
  "unmatched",
  "needs_review",
]);
export const internalTransferAttemptState = pgEnum("internal_transfer_attempt_state", [
  "pending_counterpart",
  "matched",
  "reconciled",
  "unmatched",
  "needs_review",
]);
export const workforceKind = pgEnum("workforce_kind", ["employee", "freelancer", "contractor"]);
export const timesheetState = pgEnum("timesheet_state", [
  "draft",
  "submitted",
  "approved",
  "locked",
  "billed",
  "rejected",
]);
export const timeEntryMode = pgEnum("time_entry_mode", ["timed", "allocation"]);
export const timeEntryScope = pgEnum("time_entry_scope", ["project", "internal"]);
export const laborCostRateState = pgEnum("labor_cost_rate_state", ["draft", "approved", "retired"]);
export const laborCostBasis = pgEnum("labor_cost_basis", [
  "gross_salary",
  "fully_loaded",
  "blended",
]);
export const timesheetAdjustmentState = pgEnum("timesheet_adjustment_state", [
  "draft",
  "submitted",
  "approved",
  "rejected",
]);
export const projectCostSourceType = pgEnum("project_cost_source_type", [
  "expense",
  "commercial_document",
  "journal_line",
  "timesheet",
  "adjustment",
]);
export const projectCostClass = pgEnum("project_cost_class", ["direct", "overhead_reserved"]);
export const projectCostBasis = pgEnum("project_cost_basis", ["ledger", "management"]);
export const directCostAllocationState = pgEnum("direct_cost_allocation_state", [
  "draft",
  "submitted",
  "approved",
  "posted",
  "reversed",
]);
export const projectBudgetState = pgEnum("project_budget_state", [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "superseded",
]);
export const projectBudgetKind = pgEnum("project_budget_kind", ["baseline", "revision"]);
export const projectBudgetCategory = pgEnum("project_budget_category", [
  "revenue",
  "labor",
  "freelancer",
  "vendor",
  "tool",
  "travel",
  "overhead",
]);
export const scopeChangeState = pgEnum("scope_change_state", [
  "draft",
  "submitted",
  "approved",
  "rejected",
]);
export const recognitionPolicyMethod = pgEnum("recognition_policy_method", [
  "milestone",
  "percentage_of_completion",
  "invoice",
]);
export const recognitionPolicyState = pgEnum("recognition_policy_state", [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "superseded",
]);
export const milestoneAcceptanceState = pgEnum("milestone_acceptance_state", [
  "draft",
  "submitted",
  "accepted",
  "rejected",
]);
export const recognitionEventState = pgEnum("recognition_event_state", [
  "draft",
  "submitted",
  "approved",
  "posted",
  "reversed",
  "rejected",
]);
export const overheadAllocationMethod = pgEnum("overhead_allocation_method", [
  "revenue",
  "labor_hours",
  "headcount",
  "fixed_percentage",
  "manual",
]);
export const overheadCostClass = pgEnum("overhead_cost_class", ["variable", "fixed"]);
export const overheadPolicyState = pgEnum("overhead_policy_state", [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "superseded",
]);
export const overheadPoolState = pgEnum("overhead_pool_state", ["ready", "allocated", "reversed"]);
export const overheadRunState = pgEnum("overhead_run_state", [
  "draft",
  "submitted",
  "approved",
  "posted",
  "reversed",
  "rejected",
]);

export const organizations = pgTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    legalName: text("legal_name").notNull(),
    baseCurrency: text("base_currency").notNull(),
    timezone: text("timezone").notNull(),
    ...auditColumns,
  },
  (table) => [
    check("organizations_legal_name_not_blank", sql`btrim(${table.legalName}) <> ''`),
    check("organizations_currency_iso3", sql`${table.baseCurrency} ~ '^[A-Z]{3}$'`),
    check("organizations_timezone_not_blank", sql`btrim(${table.timezone}) <> ''`),
  ],
);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    ...auditColumns,
  },
  (table) => [
    unique("users_email_unique").on(table.email),
    check("users_email_not_blank", sql`btrim(${table.email}) <> ''`),
  ],
);

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.userId] }),
    unique("organization_memberships_org_user_unique").on(table.organizationId, table.userId),
  ],
);

export const membershipRoles = pgTable(
  "membership_roles",
  {
    organizationId: text("organization_id").notNull(),
    userId: text("user_id").notNull(),
    role: role("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.userId, table.role] }),
    foreignKey({
      columns: [table.organizationId, table.userId],
      foreignColumns: [organizationMemberships.organizationId, organizationMemberships.userId],
      name: "membership_roles_membership_fk",
    }).onDelete("cascade"),
  ],
);

export const fiscalYears = pgTable(
  "fiscal_years",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    year: integer("year").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.year] }),
    check("fiscal_years_year_range", sql`${table.year} between 1900 and 9999`),
    check("fiscal_years_date_order", sql`${table.startsOn} <= ${table.endsOn}`),
  ],
);

export const fiscalPeriods = pgTable(
  "fiscal_periods",
  {
    organizationId: text("organization_id").notNull(),
    fiscalYear: integer("fiscal_year").notNull(),
    periodNumber: integer("period_number").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    state: fiscalPeriodState("state").notNull().default("open"),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.fiscalYear, table.periodNumber] }),
    foreignKey({
      columns: [table.organizationId, table.fiscalYear],
      foreignColumns: [fiscalYears.organizationId, fiscalYears.year],
      name: "fiscal_periods_fiscal_year_fk",
    }).onDelete("restrict"),
    check("fiscal_periods_number_range", sql`${table.periodNumber} between 1 and 53`),
    check("fiscal_periods_date_order", sql`${table.startsOn} <= ${table.endsOn}`),
  ],
);

export const exchangeRates = pgTable(
  "exchange_rates",
  {
    id: text("id").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    sourceCurrency: text("source_currency").notNull(),
    targetCurrency: text("target_currency").notNull(),
    rate: numeric("rate", { precision: 38, scale: 18 }).notNull(),
    source: text("source").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("exchange_rates_observation_unique").on(
      table.organizationId,
      table.sourceCurrency,
      table.targetCurrency,
      table.source,
      table.observedAt,
    ),
    check("exchange_rates_source_currency_iso3", sql`${table.sourceCurrency} ~ '^[A-Z]{3}$'`),
    check("exchange_rates_target_currency_iso3", sql`${table.targetCurrency} ~ '^[A-Z]{3}$'`),
    check(
      "exchange_rates_different_currencies",
      sql`${table.sourceCurrency} <> ${table.targetCurrency}`,
    ),
    check("exchange_rates_positive", sql`${table.rate} > 0`),
    check("exchange_rates_source_not_blank", sql`btrim(${table.source}) <> ''`),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    rootType: accountRootType("root_type").notNull(),
    isControlAccount: boolean("is_control_account").notNull().default(false),
    allowManualPosting: boolean("allow_manual_posting").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.code] }),
    unique("accounts_org_code_root_unique").on(table.organizationId, table.code, table.rootType),
    check("accounts_code_not_blank", sql`btrim(${table.code}) <> ''`),
    check("accounts_name_not_blank", sql`btrim(${table.name}) <> ''`),
    check(
      "accounts_control_manual_posting",
      sql`not ${table.isControlAccount} or not ${table.allowManualPosting}`,
    ),
  ],
);

export const accountHierarchyEdges = pgTable(
  "account_hierarchy_edges",
  {
    organizationId: text("organization_id").notNull(),
    childCode: text("child_code").notNull(),
    childRootType: accountRootType("child_root_type").notNull(),
    parentCode: text("parent_code").notNull(),
    parentRootType: accountRootType("parent_root_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.childCode] }),
    foreignKey({
      columns: [table.organizationId, table.childCode, table.childRootType],
      foreignColumns: [accounts.organizationId, accounts.code, accounts.rootType],
      name: "account_edges_child_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.parentCode, table.parentRootType],
      foreignColumns: [accounts.organizationId, accounts.code, accounts.rootType],
      name: "account_edges_parent_fk",
    }).onDelete("restrict"),
    check("account_edges_not_self", sql`${table.childCode} <> ${table.parentCode}`),
    check("account_edges_same_root", sql`${table.childRootType} = ${table.parentRootType}`),
  ],
);

export const statutoryAccountMappings = pgTable(
  "statutory_account_mappings",
  {
    organizationId: text("organization_id").notNull(),
    accountCode: text("account_code").notNull(),
    framework: statutoryFramework("framework").notNull(),
    statutoryCode: text("statutory_code").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.organizationId, table.accountCode, table.framework, table.effectiveFrom],
    }),
    foreignKey({
      columns: [table.organizationId, table.accountCode],
      foreignColumns: [accounts.organizationId, accounts.code],
      name: "statutory_mappings_account_fk",
    }).onDelete("restrict"),
    check("statutory_mappings_code_not_blank", sql`btrim(${table.statutoryCode}) <> ''`),
    check(
      "statutory_mappings_date_order",
      sql`${table.effectiveTo} is null or ${table.effectiveTo} > ${table.effectiveFrom}`,
    ),
    check(
      "statutory_mappings_approval_together",
      sql`(${table.approvedBy} is null and ${table.approvedAt} is null) or (${table.approvedBy} is not null and ${table.approvedAt} is not null)`,
    ),
  ],
);

export const taxCodeVersions = pgTable(
  "tax_code_versions",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    kind: taxKind("kind").notNull(),
    rate: numeric("rate", { precision: 12, scale: 6 }).notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    reviewState: taxReviewState("review_state").notNull().default("draft"),
    requiredEvidence: jsonb("required_evidence").$type<string[]>().notNull().default([]),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewReason: text("review_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.code, table.effectiveFrom] }),
    check("tax_codes_code_not_blank", sql`btrim(${table.code}) <> ''`),
    check("tax_codes_name_not_blank", sql`btrim(${table.name}) <> ''`),
    check("tax_codes_rate_nonnegative", sql`${table.rate} >= 0`),
    check(
      "tax_codes_date_order",
      sql`${table.effectiveTo} is null or ${table.effectiveTo} > ${table.effectiveFrom}`,
    ),
    check(
      "tax_codes_approval_metadata",
      sql`${table.reviewState} <> 'accountant_approved' or (${table.reviewedBy} is not null and ${table.reviewedAt} is not null and btrim(${table.reviewReason}) <> '')`,
    ),
  ],
);

export const dimensionValues = pgTable(
  "dimension_values",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    kind: dimensionKind("kind").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.kind, table.code] }),
    check("dimension_values_code_not_blank", sql`btrim(${table.code}) <> ''`),
    check("dimension_values_name_not_blank", sql`btrim(${table.name}) <> ''`),
  ],
);

export const dimensionRequirementVersions = pgTable(
  "dimension_requirement_versions",
  {
    organizationId: text("organization_id").notNull(),
    accountCode: text("account_code").notNull(),
    requiredKinds: jsonb("required_kinds").$type<string[]>().notNull().default([]),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    changeReason: text("change_reason").notNull(),
    correlationId: text("correlation_id").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.accountCode, table.effectiveFrom] }),
    foreignKey({
      columns: [table.organizationId, table.accountCode],
      foreignColumns: [accounts.organizationId, accounts.code],
      name: "dimension_requirements_account_fk",
    }).onDelete("restrict"),
    check(
      "dimension_requirements_date_order",
      sql`${table.effectiveTo} is null or ${table.effectiveTo} > ${table.effectiveFrom}`,
    ),
    check("dimension_requirements_reason_not_blank", sql`btrim(${table.changeReason}) <> ''`),
  ],
);

export const defaultMappingVersions = pgTable(
  "default_mapping_versions",
  {
    organizationId: text("organization_id").notNull(),
    categoryCode: text("category_code").notNull(),
    accountCode: text("account_code").notNull(),
    taxCode: text("tax_code"),
    taxEffectiveFrom: date("tax_effective_from"),
    defaultCostCenterCode: text("default_cost_center_code"),
    defaultServiceLineCode: text("default_service_line_code"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    changeReason: text("change_reason").notNull(),
    correlationId: text("correlation_id").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.categoryCode, table.effectiveFrom] }),
    foreignKey({
      columns: [table.organizationId, table.accountCode],
      foreignColumns: [accounts.organizationId, accounts.code],
      name: "default_mappings_account_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.taxCode, table.taxEffectiveFrom],
      foreignColumns: [
        taxCodeVersions.organizationId,
        taxCodeVersions.code,
        taxCodeVersions.effectiveFrom,
      ],
      name: "default_mappings_tax_version_fk",
    }).onDelete("restrict"),
    check(
      "default_mappings_tax_columns_together",
      sql`(${table.taxCode} is null and ${table.taxEffectiveFrom} is null) or (${table.taxCode} is not null and ${table.taxEffectiveFrom} is not null)`,
    ),
    check(
      "default_mappings_date_order",
      sql`${table.effectiveTo} is null or ${table.effectiveTo} > ${table.effectiveFrom}`,
    ),
    check("default_mappings_reason_not_blank", sql`btrim(${table.changeReason}) <> ''`),
  ],
);

export const parties = pgTable(
  "parties",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    displayName: text("display_name").notNull(),
    normalizedTaxId: text("normalized_tax_id"),
    status: partyStatus("status").notNull().default("active"),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    uniqueIndex("parties_org_tax_id_unique")
      .on(table.organizationId, table.normalizedTaxId)
      .where(sql`${table.normalizedTaxId} is not null`),
    check("parties_name_not_blank", sql`btrim(${table.displayName}) <> ''`),
  ],
);

export const partyRoles = pgTable(
  "party_roles",
  {
    organizationId: text("organization_id").notNull(),
    partyId: text("party_id").notNull(),
    role: partyRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.partyId, table.role] }),
    foreignKey({
      columns: [table.organizationId, table.partyId],
      foreignColumns: [parties.organizationId, parties.id],
      name: "party_roles_party_fk",
    }).onDelete("restrict"),
  ],
);

export const partyMergeLinks = pgTable(
  "party_merge_links",
  {
    organizationId: text("organization_id").notNull(),
    sourcePartyId: text("source_party_id").notNull(),
    targetPartyId: text("target_party_id").notNull(),
    reason: text("reason").notNull(),
    mergedBy: text("merged_by").notNull(),
    mergedAt: timestamp("merged_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.sourcePartyId] }),
    foreignKey({
      columns: [table.organizationId, table.sourcePartyId],
      foreignColumns: [parties.organizationId, parties.id],
      name: "party_merge_source_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.targetPartyId],
      foreignColumns: [parties.organizationId, parties.id],
      name: "party_merge_target_fk",
    }).onDelete("restrict"),
    check("party_merge_distinct", sql`${table.sourcePartyId} <> ${table.targetPartyId}`),
    check("party_merge_reason_not_blank", sql`btrim(${table.reason}) <> ''`),
  ],
);

export const partyBankAccounts = pgTable(
  "party_bank_accounts",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    partyId: text("party_id").notNull(),
    bankCode: text("bank_code").notNull(),
    normalizedAccountNumber: text("normalized_account_number").notNull(),
    accountHolderName: text("account_holder_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("party_bank_accounts_org_number_unique").on(
      table.organizationId,
      table.bankCode,
      table.normalizedAccountNumber,
    ),
    foreignKey({
      columns: [table.organizationId, table.partyId],
      foreignColumns: [parties.organizationId, parties.id],
      name: "party_bank_accounts_party_fk",
    }).onDelete("restrict"),
  ],
);

export const partyExternalReferences = pgTable(
  "party_external_references",
  {
    organizationId: text("organization_id").notNull(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    partyId: text("party_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.source, table.externalId] }),
    foreignKey({
      columns: [table.organizationId, table.partyId],
      foreignColumns: [parties.organizationId, parties.id],
      name: "party_external_refs_party_fk",
    }).onDelete("restrict"),
  ],
);

export const projects = pgTable(
  "projects",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    clientPartyId: text("client_party_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    contractType: contractType("contract_type").notNull(),
    currency: text("currency").notNull(),
    budgetMinor: bigint("budget_minor", { mode: "bigint" }).notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    state: projectState("state").notNull().default("planned"),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("projects_org_code_unique").on(table.organizationId, table.code),
    foreignKey({
      columns: [table.organizationId, table.clientPartyId],
      foreignColumns: [parties.organizationId, parties.id],
      name: "projects_client_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.ownerUserId],
      foreignColumns: [organizationMemberships.organizationId, organizationMemberships.userId],
      name: "projects_owner_membership_fk",
    }).onDelete("restrict"),
    check("projects_currency_iso3", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("projects_budget_nonnegative", sql`${table.budgetMinor} >= 0`),
    check(
      "projects_date_order",
      sql`${table.endsOn} is null or ${table.endsOn} >= ${table.startsOn}`,
    ),
  ],
);

export const workforceProfiles = pgTable(
  "workforce_profiles",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    partyId: text("party_id").notNull(),
    userId: text("user_id"),
    kind: workforceKind("kind").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    active: boolean("active").notNull().default(true),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("workforce_profiles_party_unique").on(table.organizationId, table.partyId),
    uniqueIndex("workforce_profiles_user_unique")
      .on(table.organizationId, table.userId)
      .where(sql`${table.userId} is not null`),
    foreignKey({
      columns: [table.organizationId, table.partyId],
      foreignColumns: [parties.organizationId, parties.id],
      name: "workforce_profiles_party_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.userId],
      foreignColumns: [organizationMemberships.organizationId, organizationMemberships.userId],
      name: "workforce_profiles_membership_fk",
    }).onDelete("restrict"),
    check("workforce_profiles_version", sql`${table.version} > 0`),
    check(
      "workforce_profiles_dates",
      sql`${table.endsOn} is null or ${table.endsOn} >= ${table.startsOn}`,
    ),
  ],
);

export const laborCostRates = pgTable(
  "labor_cost_rates",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    workerId: text("worker_id").notNull(),
    basis: laborCostBasis("basis").notNull(),
    hourlyRateMinor: bigint("hourly_rate_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    state: laborCostRateState("state").notNull().default("draft"),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvalReason: text("approval_reason"),
    createdBy: text("created_by").notNull(),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("labor_cost_rates_worker_effective_unique").on(
      table.organizationId,
      table.workerId,
      table.effectiveFrom,
    ),
    foreignKey({
      columns: [table.organizationId, table.workerId],
      foreignColumns: [workforceProfiles.organizationId, workforceProfiles.id],
      name: "labor_cost_rates_worker_fk",
    }).onDelete("restrict"),
    check("labor_cost_rates_nonnegative", sql`${table.hourlyRateMinor} >= 0`),
    check("labor_cost_rates_currency", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "labor_cost_rates_dates",
      sql`${table.effectiveTo} is null or ${table.effectiveTo} >= ${table.effectiveFrom}`,
    ),
    check("labor_cost_rates_version", sql`${table.version} > 0`),
    check(
      "labor_cost_rates_approval",
      sql`${table.state} <> 'approved' or (${table.approvedBy} is not null and ${table.approvedAt} is not null and ${table.approvalReason} is not null and btrim(${table.approvalReason}) <> '')`,
    ),
    index("labor_cost_rates_worker_dates_idx").on(
      table.organizationId,
      table.workerId,
      table.effectiveFrom,
      table.effectiveTo,
    ),
  ],
);

export const timesheets = pgTable(
  "timesheets",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    workerId: text("worker_id").notNull(),
    weekStartsOn: date("week_starts_on").notNull(),
    state: timesheetState("state").notNull().default("draft"),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    submittedBy: text("submitted_by"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    billedBy: text("billed_by"),
    billedAt: timestamp("billed_at", { withTimezone: true }),
    billingReference: text("billing_reference"),
    rejectedBy: text("rejected_by"),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    revisedBy: text("revised_by"),
    revisedAt: timestamp("revised_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("timesheets_worker_week_unique").on(
      table.organizationId,
      table.workerId,
      table.weekStartsOn,
    ),
    foreignKey({
      columns: [table.organizationId, table.workerId],
      foreignColumns: [workforceProfiles.organizationId, workforceProfiles.id],
      name: "timesheets_worker_fk",
    }).onDelete("restrict"),
    check("timesheets_week_monday", sql`extract(isodow from ${table.weekStartsOn}) = 1`),
    check("timesheets_version", sql`${table.version} > 0`),
    check(
      "timesheets_rejection_metadata",
      sql`${table.state} <> 'rejected' or (${table.rejectedBy} is not null and ${table.rejectedAt} is not null and ${table.rejectionReason} is not null and btrim(${table.rejectionReason}) <> '')`,
    ),
    index("timesheets_state_week_idx").on(table.organizationId, table.state, table.weekStartsOn),
  ],
);

export const timesheetEntries = pgTable(
  "timesheet_entries",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    timesheetId: text("timesheet_id").notNull(),
    workDate: date("work_date").notNull(),
    mode: timeEntryMode("mode").notNull(),
    scope: timeEntryScope("scope").notNull(),
    projectId: text("project_id"),
    contractId: text("contract_id"),
    serviceLineCode: text("service_line_code"),
    costCenterCode: text("cost_center_code"),
    activityCode: text("activity_code"),
    minutes: integer("minutes").notNull(),
    billable: boolean("billable").notNull().default(false),
    description: text("description").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    allocationPercent: integer("allocation_percent"),
    createdBy: text("created_by").notNull(),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.timesheetId],
      foreignColumns: [timesheets.organizationId, timesheets.id],
      name: "timesheet_entries_timesheet_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "timesheet_entries_project_fk",
    }).onDelete("restrict"),
    check("timesheet_entries_minutes", sql`${table.minutes} > 0 and ${table.minutes} <= 10080`),
    check("timesheet_entries_description", sql`btrim(${table.description}) <> ''`),
    check(
      "timesheet_entries_scope_project",
      sql`(${table.scope} = 'project' and ${table.projectId} is not null) or (${table.scope} = 'internal' and ${table.projectId} is null and ${table.billable} = false)`,
    ),
    check(
      "timesheet_entries_mode_fields",
      sql`(${table.mode} = 'timed' and ${table.startedAt} is not null and ${table.endedAt} is not null and ${table.endedAt} > ${table.startedAt} and ${table.allocationPercent} is null) or (${table.mode} = 'allocation' and ${table.startedAt} is null and ${table.endedAt} is null and ${table.allocationPercent} between 1 and 100)`,
    ),
    index("timesheet_entries_timesheet_date_idx").on(
      table.organizationId,
      table.timesheetId,
      table.workDate,
    ),
  ],
);

export const timesheetCostSnapshots = pgTable(
  "timesheet_cost_snapshots",
  {
    organizationId: text("organization_id").notNull(),
    entryId: text("entry_id").notNull(),
    rateId: text("rate_id").notNull(),
    appliedHourlyRateMinor: bigint("applied_hourly_rate_minor", { mode: "bigint" }).notNull(),
    appliedCostMinor: bigint("applied_cost_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
    appliedBy: text("applied_by").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.entryId] }),
    foreignKey({
      columns: [table.organizationId, table.entryId],
      foreignColumns: [timesheetEntries.organizationId, timesheetEntries.id],
      name: "timesheet_cost_snapshots_entry_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.rateId],
      foreignColumns: [laborCostRates.organizationId, laborCostRates.id],
      name: "timesheet_cost_snapshots_rate_fk",
    }).onDelete("restrict"),
    check("timesheet_cost_snapshots_rate", sql`${table.appliedHourlyRateMinor} >= 0`),
    check("timesheet_cost_snapshots_cost", sql`${table.appliedCostMinor} >= 0`),
    check("timesheet_cost_snapshots_currency", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const timesheetAdjustments = pgTable(
  "timesheet_adjustments",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    timesheetId: text("timesheet_id").notNull(),
    entryId: text("entry_id").notNull(),
    workDate: date("work_date").notNull(),
    minuteDelta: integer("minute_delta").notNull(),
    costDeltaMinor: bigint("cost_delta_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    reason: text("reason").notNull(),
    state: timesheetAdjustmentState("state").notNull().default("draft"),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    requestedBy: text("requested_by").notNull(),
    submittedBy: text("submitted_by"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvalReason: text("approval_reason"),
    rejectedBy: text("rejected_by"),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.timesheetId],
      foreignColumns: [timesheets.organizationId, timesheets.id],
      name: "timesheet_adjustments_timesheet_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.entryId],
      foreignColumns: [timesheetEntries.organizationId, timesheetEntries.id],
      name: "timesheet_adjustments_entry_fk",
    }).onDelete("restrict"),
    check(
      "timesheet_adjustments_nonzero",
      sql`${table.minuteDelta} <> 0 or ${table.costDeltaMinor} <> 0`,
    ),
    check("timesheet_adjustments_currency", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("timesheet_adjustments_reason", sql`btrim(${table.reason}) <> ''`),
    check("timesheet_adjustments_version", sql`${table.version} > 0`),
    check(
      "timesheet_adjustments_approval",
      sql`${table.state} <> 'approved' or (${table.approvedBy} is not null and ${table.approvedAt} is not null and ${table.approvalReason} is not null and btrim(${table.approvalReason}) <> '')`,
    ),
    check(
      "timesheet_adjustments_rejection",
      sql`${table.state} <> 'rejected' or (${table.rejectedBy} is not null and ${table.rejectedAt} is not null and ${table.rejectionReason} is not null and btrim(${table.rejectionReason}) <> '')`,
    ),
  ],
);

export const workforceCapacityVersions = pgTable(
  "workforce_capacity_versions",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    workerId: text("worker_id").notNull(),
    weeklyMinutes: integer("weekly_minutes").notNull(),
    workdays: jsonb("workdays").$type<number[]>().notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    reason: text("reason").notNull(),
    createdBy: text("created_by").notNull(),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("workforce_capacity_worker_effective_unique").on(
      table.organizationId,
      table.workerId,
      table.effectiveFrom,
    ),
    foreignKey({
      columns: [table.organizationId, table.workerId],
      foreignColumns: [workforceProfiles.organizationId, workforceProfiles.id],
      name: "workforce_capacity_worker_fk",
    }).onDelete("restrict"),
    check("workforce_capacity_minutes", sql`${table.weeklyMinutes} between 0 and 10080`),
    check(
      "workforce_capacity_dates",
      sql`${table.effectiveTo} is null or ${table.effectiveTo} >= ${table.effectiveFrom}`,
    ),
    check("workforce_capacity_version", sql`${table.version} > 0`),
    check("workforce_capacity_reason", sql`btrim(${table.reason}) <> ''`),
    index("workforce_capacity_worker_dates_idx").on(
      table.organizationId,
      table.workerId,
      table.effectiveFrom,
      table.effectiveTo,
    ),
  ],
);

export const projectCostItems = pgTable(
  "project_cost_items",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    sourceType: projectCostSourceType("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourceLineId: text("source_line_id"),
    projectId: text("project_id"),
    costClass: projectCostClass("cost_class").notNull(),
    basis: projectCostBasis("basis").notNull(),
    effectiveOn: date("effective_on").notNull(),
    ledgerAccountCode: text("ledger_account_code").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    baseAmountMinor: bigint("base_amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    journalId: text("journal_id"),
    evidenceId: text("evidence_id"),
    description: text("description").notNull(),
    createdBy: text("created_by").notNull(),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("project_cost_items_source_unique").on(
      table.organizationId,
      table.sourceType,
      table.sourceId,
      table.sourceLineId,
      table.basis,
    ),
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "project_cost_items_project_fk",
    }).onDelete("restrict"),
    check(
      "project_cost_items_amount_positive",
      sql`${table.amountMinor} > 0 and ${table.baseAmountMinor} > 0`,
    ),
    check("project_cost_items_currency", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("project_cost_items_description", sql`btrim(${table.description}) <> ''`),
    index("project_cost_items_unallocated_idx").on(
      table.organizationId,
      table.projectId,
      table.costClass,
      table.basis,
    ),
  ],
);

export const directCostAllocations = pgTable(
  "direct_cost_allocations",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    sourceCostItemId: text("source_cost_item_id").notNull(),
    allocatableAmountMinor: bigint("allocatable_amount_minor", { mode: "bigint" }).notNull(),
    allocatableBaseAmountMinor: bigint("allocatable_base_amount_minor", {
      mode: "bigint",
    }).notNull(),
    state: directCostAllocationState("state").notNull().default("draft"),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    submittedBy: text("submitted_by"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    postedBy: text("posted_by"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    journalId: text("journal_id"),
    reversedBy: text("reversed_by"),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversalJournalId: text("reversal_journal_id"),
    reversalReason: text("reversal_reason"),
    createdBy: text("created_by").notNull(),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.sourceCostItemId],
      foreignColumns: [projectCostItems.organizationId, projectCostItems.id],
      name: "direct_cost_allocations_source_fk",
    }).onDelete("restrict"),
    check(
      "direct_cost_allocations_amount",
      sql`${table.allocatableAmountMinor} > 0 and ${table.allocatableBaseAmountMinor} > 0`,
    ),
    check("direct_cost_allocations_version", sql`${table.version} > 0`),
    index("direct_cost_allocations_source_state_idx").on(
      table.organizationId,
      table.sourceCostItemId,
      table.state,
    ),
  ],
);

export const directCostAllocationSplits = pgTable(
  "direct_cost_allocation_splits",
  {
    organizationId: text("organization_id").notNull(),
    allocationId: text("allocation_id").notNull(),
    lineNumber: integer("line_number").notNull(),
    projectId: text("project_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    baseAmountMinor: bigint("base_amount_minor", { mode: "bigint" }).notNull(),
    reason: text("reason").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.allocationId, table.lineNumber] }),
    foreignKey({
      columns: [table.organizationId, table.allocationId],
      foreignColumns: [directCostAllocations.organizationId, directCostAllocations.id],
      name: "direct_cost_allocation_splits_allocation_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "direct_cost_allocation_splits_project_fk",
    }).onDelete("restrict"),
    check("direct_cost_allocation_splits_line", sql`${table.lineNumber} > 0`),
    check(
      "direct_cost_allocation_splits_amount",
      sql`${table.amountMinor} > 0 and ${table.baseAmountMinor} > 0`,
    ),
    check("direct_cost_allocation_splits_reason", sql`btrim(${table.reason}) <> ''`),
  ],
);

export const contracts = pgTable(
  "contracts",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    projectId: text("project_id").notNull(),
    reference: text("reference").notNull(),
    signedOn: date("signed_on"),
    valueMinor: bigint("value_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("contracts_org_reference_unique").on(table.organizationId, table.reference),
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "contracts_project_fk",
    }).onDelete("restrict"),
    check("contracts_value_nonnegative", sql`${table.valueMinor} >= 0`),
    check("contracts_currency_iso3", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const milestones = pgTable(
  "milestones",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    contractId: text("contract_id").notNull(),
    name: text("name").notNull(),
    dueOn: date("due_on"),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    sequence: integer("sequence").notNull(),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("milestones_contract_sequence_unique").on(
      table.organizationId,
      table.contractId,
      table.sequence,
    ),
    foreignKey({
      columns: [table.organizationId, table.contractId],
      foreignColumns: [contracts.organizationId, contracts.id],
      name: "milestones_contract_fk",
    }).onDelete("restrict"),
    check("milestones_amount_nonnegative", sql`${table.amountMinor} >= 0`),
    check("milestones_sequence_positive", sql`${table.sequence} > 0`),
  ],
);

export const scopeChanges = pgTable(
  "scope_changes",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    projectId: text("project_id").notNull(),
    reason: text("reason").notNull(),
    expectedRevenueImpactMinor: bigint("expected_revenue_impact_minor", {
      mode: "bigint",
    }).notNull(),
    expectedCostImpactMinor: bigint("expected_cost_impact_minor", { mode: "bigint" }).notNull(),
    expectedScheduleImpactDays: integer("expected_schedule_impact_days").notNull(),
    evidenceIds: jsonb("evidence_ids").$type<string[]>().notNull().default([]),
    state: scopeChangeState("state").notNull().default("draft"),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    submittedBy: text("submitted_by"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedBy: text("rejected_by"),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    ...auditColumns,
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.id] }),
    foreignKey({
      columns: [t.organizationId, t.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "scope_changes_project_fk",
    }).onDelete("restrict"),
    check("scope_changes_reason", sql`btrim(${t.reason}) <> ''`),
    check("scope_changes_version", sql`${t.version} > 0`),
    index("scope_changes_project_state_idx").on(t.organizationId, t.projectId, t.state),
  ],
);

export const projectBudgetVersions = pgTable(
  "project_budget_versions",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    projectId: text("project_id").notNull(),
    versionNumber: integer("version_number").notNull(),
    kind: projectBudgetKind("kind").notNull(),
    previousVersionId: text("previous_version_id"),
    scopeChangeId: text("scope_change_id"),
    currency: text("currency").notNull(),
    effectiveOn: date("effective_on").notNull(),
    state: projectBudgetState("state").notNull().default("draft"),
    revenueTotalMinor: bigint("revenue_total_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    directCostTotalMinor: bigint("direct_cost_total_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    overheadTotalMinor: bigint("overhead_total_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    submittedBy: text("submitted_by"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedBy: text("rejected_by"),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    ...auditColumns,
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.id] }),
    unique("project_budget_version_number_unique").on(
      t.organizationId,
      t.projectId,
      t.versionNumber,
    ),
    foreignKey({
      columns: [t.organizationId, t.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "project_budget_versions_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.previousVersionId],
      foreignColumns: [t.organizationId, t.id],
      name: "project_budget_versions_previous_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.scopeChangeId],
      foreignColumns: [scopeChanges.organizationId, scopeChanges.id],
      name: "project_budget_versions_scope_fk",
    }).onDelete("restrict"),
    check("project_budget_version_number", sql`${t.versionNumber} > 0`),
    check("project_budget_version_resource_version", sql`${t.version} > 0`),
    check("project_budget_currency", sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check(
      "project_budget_totals",
      sql`${t.revenueTotalMinor} >= 0 and ${t.directCostTotalMinor} >= 0 and ${t.overheadTotalMinor} >= 0`,
    ),
    check(
      "project_budget_revision_links",
      sql`(${t.kind}='baseline' and ${t.previousVersionId} is null and ${t.scopeChangeId} is null) or (${t.kind}='revision' and ${t.previousVersionId} is not null and ${t.scopeChangeId} is not null)`,
    ),
    index("project_budget_project_state_idx").on(t.organizationId, t.projectId, t.state),
  ],
);

export const projectBudgetLines = pgTable(
  "project_budget_lines",
  {
    organizationId: text("organization_id").notNull(),
    budgetVersionId: text("budget_version_id").notNull(),
    id: text("id").notNull(),
    category: projectBudgetCategory("category").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    serviceLineCode: text("service_line_code"),
    milestoneId: text("milestone_id"),
    note: text("note"),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.budgetVersionId, t.id] }),
    foreignKey({
      columns: [t.organizationId, t.budgetVersionId],
      foreignColumns: [projectBudgetVersions.organizationId, projectBudgetVersions.id],
      name: "project_budget_lines_budget_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.milestoneId],
      foreignColumns: [milestones.organizationId, milestones.id],
      name: "project_budget_lines_milestone_fk",
    }).onDelete("restrict"),
    check("project_budget_line_amount", sql`${t.amountMinor} >= 0`),
  ],
);

export const revenueRecognitionPolicies = pgTable(
  "revenue_recognition_policies",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    projectId: text("project_id").notNull(),
    versionNumber: integer("version_number").notNull(),
    method: recognitionPolicyMethod("method").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    currency: text("currency").notNull(),
    contractValueMinor: bigint("contract_value_minor", { mode: "bigint" }).notNull(),
    revenueAccountCode: text("revenue_account_code").notNull(),
    contractAssetAccountCode: text("contract_asset_account_code").notNull(),
    contractLiabilityAccountCode: text("contract_liability_account_code").notNull(),
    evidenceRequired: boolean("evidence_required").notNull().default(true),
    state: recognitionPolicyState("state").notNull().default("draft"),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    submittedBy: text("submitted_by"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedBy: text("rejected_by"),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    ...auditColumns,
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.id] }),
    unique("recognition_policy_project_version_unique").on(
      t.organizationId,
      t.projectId,
      t.versionNumber,
    ),
    foreignKey({
      columns: [t.organizationId, t.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "recognition_policies_project_fk",
    }).onDelete("restrict"),
    check("recognition_policy_version_number", sql`${t.versionNumber} > 0`),
    check("recognition_policy_version", sql`${t.version} > 0`),
    check("recognition_policy_contract_value", sql`${t.contractValueMinor} >= 0`),
    check("recognition_policy_currency", sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check(
      "recognition_policy_dates",
      sql`${t.effectiveTo} is null or ${t.effectiveTo} >= ${t.effectiveFrom}`,
    ),
    index("recognition_policy_effective_idx").on(
      t.organizationId,
      t.projectId,
      t.state,
      t.effectiveFrom,
      t.effectiveTo,
    ),
  ],
);

export const milestoneAcceptances = pgTable(
  "milestone_acceptances",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    milestoneId: text("milestone_id").notNull(),
    acceptedAmountMinor: bigint("accepted_amount_minor", { mode: "bigint" }).notNull(),
    effectiveOn: date("effective_on").notNull(),
    evidenceIds: jsonb("evidence_ids").$type<string[]>().notNull().default([]),
    state: milestoneAcceptanceState("state").notNull().default("draft"),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    submittedBy: text("submitted_by"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    acceptedBy: text("accepted_by"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    rejectedBy: text("rejected_by"),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    reason: text("reason").notNull(),
    createdBy: text("created_by").notNull(),
    ...auditColumns,
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.id] }),
    foreignKey({
      columns: [t.organizationId, t.milestoneId],
      foreignColumns: [milestones.organizationId, milestones.id],
      name: "milestone_acceptances_milestone_fk",
    }).onDelete("restrict"),
    check("milestone_acceptance_amount", sql`${t.acceptedAmountMinor} > 0`),
    check("milestone_acceptance_reason", sql`btrim(${t.reason}) <> ''`),
    check("milestone_acceptance_version", sql`${t.version} > 0`),
    index("milestone_acceptance_state_idx").on(t.organizationId, t.milestoneId, t.state),
  ],
);

export const revenueRecognitionEvents = pgTable(
  "revenue_recognition_events",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    projectId: text("project_id").notNull(),
    policyId: text("policy_id").notNull(),
    policyVersionNumber: integer("policy_version_number").notNull(),
    milestoneAcceptanceId: text("milestone_acceptance_id"),
    effectiveOn: date("effective_on").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    evidenceIds: jsonb("evidence_ids").$type<string[]>().notNull().default([]),
    policySnapshot: jsonb("policy_snapshot").$type<Record<string, unknown>>().notNull(),
    state: recognitionEventState("state").notNull().default("draft"),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    submittedBy: text("submitted_by"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedBy: text("rejected_by"),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    postedBy: text("posted_by"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    journalId: text("journal_id"),
    reversedBy: text("reversed_by"),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversalJournalId: text("reversal_journal_id"),
    reversalReason: text("reversal_reason"),
    reason: text("reason").notNull(),
    createdBy: text("created_by").notNull(),
    ...auditColumns,
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.id] }),
    foreignKey({
      columns: [t.organizationId, t.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "recognition_events_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.policyId],
      foreignColumns: [revenueRecognitionPolicies.organizationId, revenueRecognitionPolicies.id],
      name: "recognition_events_policy_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.milestoneAcceptanceId],
      foreignColumns: [milestoneAcceptances.organizationId, milestoneAcceptances.id],
      name: "recognition_events_acceptance_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.journalId],
      foreignColumns: [journalEntries.organizationId, journalEntries.id],
      name: "recognition_events_journal_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.reversalJournalId],
      foreignColumns: [journalEntries.organizationId, journalEntries.id],
      name: "recognition_events_reversal_fk",
    }).onDelete("restrict"),
    check("recognition_event_amount", sql`${t.amountMinor} > 0`),
    check("recognition_event_currency", sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check("recognition_event_reason", sql`btrim(${t.reason}) <> ''`),
    check("recognition_event_version", sql`${t.version} > 0`),
    index("recognition_events_project_effective_idx").on(
      t.organizationId,
      t.projectId,
      t.effectiveOn,
      t.state,
    ),
  ],
);

export const overheadAllocationPolicies = pgTable(
  "overhead_allocation_policies",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    policyCode: text("policy_code").notNull(),
    versionNumber: integer("version_number").notNull(),
    name: text("name").notNull(),
    method: overheadAllocationMethod("method").notNull(),
    costClass: overheadCostClass("cost_class").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    configuration: jsonb("configuration").$type<Record<string, unknown>>().notNull().default({}),
    state: overheadPolicyState("state").notNull().default("draft"),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    submittedBy: text("submitted_by"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedBy: text("rejected_by"),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    ...auditColumns,
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.id] }),
    unique("overhead_policy_code_version_unique").on(
      t.organizationId,
      t.policyCode,
      t.versionNumber,
    ),
    check("overhead_policy_code", sql`btrim(${t.policyCode}) <> ''`),
    check("overhead_policy_name", sql`btrim(${t.name}) <> ''`),
    check("overhead_policy_version_number", sql`${t.versionNumber} > 0`),
    check("overhead_policy_version", sql`${t.version} > 0`),
    check(
      "overhead_policy_dates",
      sql`${t.effectiveTo} is null or ${t.effectiveTo} >= ${t.effectiveFrom}`,
    ),
    index("overhead_policy_effective_idx").on(
      t.organizationId,
      t.policyCode,
      t.state,
      t.effectiveFrom,
      t.effectiveTo,
    ),
  ],
);

export const overheadSourcePools = pgTable(
  "overhead_source_pools",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    policyId: text("policy_id").notNull(),
    policyVersionNumber: integer("policy_version_number").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    currency: text("currency").notNull(),
    sourceAmountMinor: bigint("source_amount_minor", { mode: "bigint" }).notNull(),
    sourceBaseAmountMinor: bigint("source_base_amount_minor", { mode: "bigint" }).notNull(),
    state: overheadPoolState("state").notNull().default("ready"),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    reason: text("reason").notNull(),
    createdBy: text("created_by").notNull(),
    ...auditColumns,
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.id] }),
    foreignKey({
      columns: [t.organizationId, t.policyId],
      foreignColumns: [overheadAllocationPolicies.organizationId, overheadAllocationPolicies.id],
      name: "overhead_source_pools_policy_fk",
    }).onDelete("restrict"),
    check("overhead_pool_period", sql`${t.periodEnd} >= ${t.periodStart}`),
    check("overhead_pool_currency", sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check(
      "overhead_pool_amount",
      sql`${t.sourceAmountMinor} > 0 and ${t.sourceBaseAmountMinor} > 0`,
    ),
    check("overhead_pool_reason", sql`btrim(${t.reason}) <> ''`),
    check("overhead_pool_version", sql`${t.version} > 0`),
    index("overhead_pool_period_idx").on(t.organizationId, t.periodStart, t.periodEnd, t.state),
  ],
);

export const overheadSourcePoolItems = pgTable(
  "overhead_source_pool_items",
  {
    organizationId: text("organization_id").notNull(),
    poolId: text("pool_id").notNull(),
    sourceCostItemId: text("source_cost_item_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    baseAmountMinor: bigint("base_amount_minor", { mode: "bigint" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.poolId, t.sourceCostItemId] }),
    unique("overhead_source_item_exclusive").on(t.organizationId, t.sourceCostItemId),
    foreignKey({
      columns: [t.organizationId, t.poolId],
      foreignColumns: [overheadSourcePools.organizationId, overheadSourcePools.id],
      name: "overhead_pool_items_pool_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.sourceCostItemId],
      foreignColumns: [projectCostItems.organizationId, projectCostItems.id],
      name: "overhead_pool_items_cost_fk",
    }).onDelete("restrict"),
    check("overhead_pool_item_amount", sql`${t.amountMinor} > 0 and ${t.baseAmountMinor} > 0`),
  ],
);

export const overheadAllocationRuns = pgTable(
  "overhead_allocation_runs",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    poolId: text("pool_id").notNull(),
    policyId: text("policy_id").notNull(),
    policyVersionNumber: integer("policy_version_number").notNull(),
    method: overheadAllocationMethod("method").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    currency: text("currency").notNull(),
    allocatableAmountMinor: bigint("allocatable_amount_minor", { mode: "bigint" }).notNull(),
    basisSnapshot: jsonb("basis_snapshot").$type<readonly Record<string, unknown>[]>().notNull(),
    policySnapshot: jsonb("policy_snapshot").$type<Record<string, unknown>>().notNull(),
    state: overheadRunState("state").notNull().default("draft"),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    submittedBy: text("submitted_by"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedBy: text("rejected_by"),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    postedBy: text("posted_by"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    journalId: text("journal_id"),
    reversedBy: text("reversed_by"),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversalJournalId: text("reversal_journal_id"),
    reversalReason: text("reversal_reason"),
    reason: text("reason").notNull(),
    createdBy: text("created_by").notNull(),
    ...auditColumns,
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.id] }),
    unique("overhead_run_pool_unique").on(t.organizationId, t.poolId),
    foreignKey({
      columns: [t.organizationId, t.poolId],
      foreignColumns: [overheadSourcePools.organizationId, overheadSourcePools.id],
      name: "overhead_runs_pool_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.policyId],
      foreignColumns: [overheadAllocationPolicies.organizationId, overheadAllocationPolicies.id],
      name: "overhead_runs_policy_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.journalId],
      foreignColumns: [journalEntries.organizationId, journalEntries.id],
      name: "overhead_runs_journal_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.reversalJournalId],
      foreignColumns: [journalEntries.organizationId, journalEntries.id],
      name: "overhead_runs_reversal_fk",
    }).onDelete("restrict"),
    check("overhead_run_period", sql`${t.periodEnd} >= ${t.periodStart}`),
    check("overhead_run_currency", sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check("overhead_run_amount", sql`${t.allocatableAmountMinor} > 0`),
    check("overhead_run_version", sql`${t.version} > 0`),
    check("overhead_run_reason", sql`btrim(${t.reason}) <> ''`),
    index("overhead_run_period_state_idx").on(
      t.organizationId,
      t.periodStart,
      t.periodEnd,
      t.state,
    ),
  ],
);

export const overheadAllocationSplits = pgTable(
  "overhead_allocation_splits",
  {
    organizationId: text("organization_id").notNull(),
    runId: text("run_id").notNull(),
    projectId: text("project_id").notNull(),
    basisValue: bigint("basis_value", { mode: "bigint" }).notNull(),
    basisTotal: bigint("basis_total", { mode: "bigint" }).notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    roundingRank: integer("rounding_rank").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.runId, t.projectId] }),
    foreignKey({
      columns: [t.organizationId, t.runId],
      foreignColumns: [overheadAllocationRuns.organizationId, overheadAllocationRuns.id],
      name: "overhead_splits_run_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.organizationId, t.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "overhead_splits_project_fk",
    }).onDelete("restrict"),
    check("overhead_split_basis", sql`${t.basisValue} >= 0 and ${t.basisTotal} > 0`),
    check("overhead_split_amount", sql`${t.amountMinor} >= 0`),
    check("overhead_split_rank", sql`${t.roundingRank} > 0`),
  ],
);

export const resourceVersions = pgTable(
  "resource_versions",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    resourceType: text("resource_type").notNull(),
    resourceKey: text("resource_key").notNull(),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.resourceType, table.resourceKey] }),
    check("resource_versions_positive", sql`${table.version} > 0`),
  ],
);

export const apiIdempotencyRecords = pgTable(
  "api_idempotency_records",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    idempotencyKey: text("idempotency_key").notNull(),
    operation: text("operation").notNull(),
    requestHash: text("request_hash").notNull(),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.idempotencyKey] }),
    check("idempotency_operation_not_blank", sql`btrim(${table.operation}) <> ''`),
  ],
);

export const resourceAuditEvents = pgTable(
  "resource_audit_events",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceKey: text("resource_key").notNull(),
    resourceVersion: bigint("resource_version", { mode: "bigint" }).notNull(),
    action: text("action").notNull(),
    actorId: text("actor_id").notNull(),
    correlationId: text("correlation_id").notNull(),
    beforeState: jsonb("before_state").$type<Record<string, unknown>>(),
    afterState: jsonb("after_state").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    check("resource_audit_version_positive", sql`${table.resourceVersion} > 0`),
  ],
);

export const apiCredentials = pgTable(
  "api_credentials",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    actorId: text("actor_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    roles: jsonb("roles").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("api_credentials_token_hash_unique").on(table.tokenHash),
    check("api_credentials_active_status", sql`${table.status} in ('active','revoked')`),
  ],
);

export const journalEntries = pgTable(
  "journal_entries",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    journalDate: date("journal_date").notNull(),
    description: text("description").notNull(),
    currency: text("currency").notNull(),
    state: journalState("state").notNull().default("draft"),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    postedBy: text("posted_by"),
    createdBy: text("created_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: text("approved_by"),
    approvalReason: text("approval_reason"),
    selfApproved: boolean("self_approved").notNull().default(false),
    reversalOfId: text("reversal_of_id"),
    replacementOfId: text("replacement_of_id"),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("journal_entries_org_reversal_unique").on(table.organizationId, table.reversalOfId),
    unique("journal_entries_org_replacement_unique").on(
      table.organizationId,
      table.replacementOfId,
    ),
    foreignKey({
      columns: [table.organizationId, table.reversalOfId],
      foreignColumns: [table.organizationId, table.id],
      name: "journal_entries_reversal_of_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.replacementOfId],
      foreignColumns: [table.organizationId, table.id],
      name: "journal_entries_replacement_of_fk",
    }).onDelete("restrict"),
    check("journal_entries_description_not_blank", sql`btrim(${table.description}) <> ''`),
    check("journal_entries_currency_iso3", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("journal_entries_version_positive", sql`${table.version} > 0`),
    check(
      "journal_entries_posting_metadata",
      sql`(${table.state} in ('posted','reversed') and ${table.postedAt} is not null and ${table.postedBy} is not null) or (${table.state} in ('draft','approved') and ${table.postedAt} is null and ${table.postedBy} is null)`,
    ),
    check(
      "journal_entries_approval_metadata",
      sql`(${table.state} = 'draft' and ${table.approvedAt} is null and ${table.approvedBy} is null and ${table.approvalReason} is null) or (${table.state} in ('approved','posted','reversed') and ${table.approvedAt} is not null and ${table.approvedBy} is not null and ${table.approvalReason} is not null and btrim(${table.approvalReason}) <> '')`,
    ),
  ],
);

export const accountingWorkflowPolicies = pgTable(
  "accounting_workflow_policies",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organizations.id),
    allowSelfApproval: boolean("allow_self_approval").notNull().default(false),
    selfApprovalMaxMinor: bigint("self_approval_max_minor", { mode: "bigint" }),
    softLockPostingRoles: jsonb("soft_lock_posting_roles")
      .$type<string[]>()
      .notNull()
      .default(["owner", "finance_admin"]),
    updatedBy: text("updated_by").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "workflow_policy_self_approval_threshold",
      sql`(not ${table.allowSelfApproval} and ${table.selfApprovalMaxMinor} is null) or (${table.allowSelfApproval} and ${table.selfApprovalMaxMinor} is not null and ${table.selfApprovalMaxMinor} >= 0)`,
    ),
  ],
);

export const fiscalPeriodEvents = pgTable(
  "fiscal_period_events",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    fiscalYear: integer("fiscal_year").notNull(),
    periodNumber: integer("period_number").notNull(),
    action: text("action").notNull(),
    fromState: fiscalPeriodState("from_state").notNull(),
    toState: fiscalPeriodState("to_state").notNull(),
    actorId: text("actor_id").notNull(),
    reason: text("reason").notNull(),
    correlationId: text("correlation_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.fiscalYear, table.periodNumber],
      foreignColumns: [
        fiscalPeriods.organizationId,
        fiscalPeriods.fiscalYear,
        fiscalPeriods.periodNumber,
      ],
      name: "fiscal_period_events_period_fk",
    }).onDelete("restrict"),
    check("fiscal_period_event_action", sql`${table.action} in ('close','reopen')`),
    check("fiscal_period_event_reason_not_blank", sql`btrim(${table.reason}) <> ''`),
    check("fiscal_period_event_state_changes", sql`${table.fromState} <> ${table.toState}`),
  ],
);

export const journalLines = pgTable(
  "journal_lines",
  {
    organizationId: text("organization_id").notNull(),
    journalId: text("journal_id").notNull(),
    lineNumber: integer("line_number").notNull(),
    accountCode: text("account_code").notNull(),
    debitMinor: bigint("debit_minor", { mode: "bigint" }),
    creditMinor: bigint("credit_minor", { mode: "bigint" }),
    description: text("description"),
    dimensions: jsonb("dimensions").$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.journalId, table.lineNumber] }),
    foreignKey({
      columns: [table.organizationId, table.journalId],
      foreignColumns: [journalEntries.organizationId, journalEntries.id],
      name: "journal_lines_journal_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.accountCode],
      foreignColumns: [accounts.organizationId, accounts.code],
      name: "journal_lines_account_fk",
    }).onDelete("restrict"),
    check("journal_lines_number_positive", sql`${table.lineNumber} > 0`),
    check(
      "journal_lines_debit_xor_credit",
      sql`(${table.debitMinor} is not null and ${table.debitMinor} > 0 and ${table.creditMinor} is null) or (${table.creditMinor} is not null and ${table.creditMinor} > 0 and ${table.debitMinor} is null)`,
    ),
  ],
);

export const journalPostingCommands = pgTable(
  "journal_posting_commands",
  {
    organizationId: text("organization_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    journalId: text("journal_id").notNull(),
    requestHash: text("request_hash").notNull(),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.idempotencyKey] }),
    foreignKey({
      columns: [table.organizationId, table.journalId],
      foreignColumns: [journalEntries.organizationId, journalEntries.id],
      name: "journal_posting_commands_journal_fk",
    }).onDelete("restrict"),
  ],
);

export const openingBalanceImports = pgTable(
  "opening_balance_imports",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    journalId: text("journal_id").notNull(),
    openingDate: date("opening_date").notNull(),
    currency: text("currency").notNull(),
    controlDebitMinor: bigint("control_debit_minor", { mode: "bigint" }).notNull(),
    controlCreditMinor: bigint("control_credit_minor", { mode: "bigint" }).notNull(),
    status: text("status").notNull().default("draft"),
    createdBy: text("created_by").notNull(),
    correlationId: text("correlation_id").notNull(),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("opening_balance_imports_journal_unique").on(table.organizationId, table.journalId),
    foreignKey({
      columns: [table.organizationId, table.journalId],
      foreignColumns: [journalEntries.organizationId, journalEntries.id],
      name: "opening_balance_imports_journal_fk",
    }).onDelete("restrict"),
    check("opening_balance_imports_currency_iso3", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "opening_balance_imports_balanced",
      sql`${table.controlDebitMinor} = ${table.controlCreditMinor}`,
    ),
    check("opening_balance_imports_positive", sql`${table.controlDebitMinor} > 0`),
    check(
      "opening_balance_imports_status",
      sql`${table.status} in ('draft','approved','posted','rejected')`,
    ),
  ],
);

export const commercialDocuments = pgTable(
  "commercial_documents",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    type: commercialDocumentType("type").notNull(),
    state: commercialDocumentState("state").notNull().default("draft"),
    documentNumber: text("document_number").notNull(),
    series: text("series"),
    fiscalYear: integer("fiscal_year").notNull(),
    partyId: text("party_id").notNull(),
    documentDate: date("document_date").notNull(),
    dueDate: date("due_date").notNull(),
    currency: text("currency").notNull(),
    netMinor: bigint("net_minor", { mode: "bigint" }).notNull(),
    taxMinor: bigint("tax_minor", { mode: "bigint" }).notNull(),
    grossMinor: bigint("gross_minor", { mode: "bigint" }).notNull(),
    controlAccountCode: text("control_account_code").notNull(),
    originalDocumentId: text("original_document_id"),
    journalId: text("journal_id"),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    createdBy: text("created_by").notNull(),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    issuedOrPostedBy: text("issued_or_posted_by"),
    issuedOrPostedAt: timestamp("issued_or_posted_at", { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("commercial_documents_number_unique").on(
      table.organizationId,
      table.type,
      table.series,
      table.fiscalYear,
      table.documentNumber,
    ),
    unique("commercial_documents_party_reference_unique").on(
      table.organizationId,
      table.type,
      table.partyId,
      table.documentNumber,
    ),
    foreignKey({
      columns: [table.organizationId, table.partyId],
      foreignColumns: [parties.organizationId, parties.id],
      name: "commercial_documents_party_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.originalDocumentId],
      foreignColumns: [table.organizationId, table.id],
      name: "commercial_documents_original_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.journalId],
      foreignColumns: [journalEntries.organizationId, journalEntries.id],
      name: "commercial_documents_journal_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.controlAccountCode],
      foreignColumns: [accounts.organizationId, accounts.code],
      name: "commercial_documents_control_account_fk",
    }).onDelete("restrict"),
    check("commercial_documents_number_not_blank", sql`btrim(${table.documentNumber}) <> ''`),
    check(
      "commercial_documents_sales_series",
      sql`${table.type} = 'purchase_invoice' or (${table.series} is not null and btrim(${table.series}) <> '')`,
    ),
    check("commercial_documents_currency_iso3", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("commercial_documents_due_date", sql`${table.dueDate} >= ${table.documentDate}`),
    check(
      "commercial_documents_totals",
      sql`${table.netMinor} >= 0 and ${table.taxMinor} >= 0 and ${table.grossMinor} = ${table.netMinor} + ${table.taxMinor} and ${table.grossMinor} > 0`,
    ),
    check(
      "commercial_documents_credit_origin",
      sql`(${table.type} = 'credit_note' and ${table.originalDocumentId} is not null) or (${table.type} <> 'credit_note' and ${table.originalDocumentId} is null)`,
    ),
    check("commercial_documents_version_positive", sql`${table.version} > 0`),
  ],
);

export const commercialDocumentLines = pgTable(
  "commercial_document_lines",
  {
    organizationId: text("organization_id").notNull(),
    documentId: text("document_id").notNull(),
    lineNumber: integer("line_number").notNull(),
    originalLineNumber: integer("original_line_number"),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 24, scale: 6 }).notNull(),
    unitPriceMinor: bigint("unit_price_minor", { mode: "bigint" }).notNull(),
    netMinor: bigint("net_minor", { mode: "bigint" }).notNull(),
    taxMinor: bigint("tax_minor", { mode: "bigint" }).notNull(),
    grossMinor: bigint("gross_minor", { mode: "bigint" }).notNull(),
    primaryAccountCode: text("primary_account_code").notNull(),
    taxAccountCode: text("tax_account_code"),
    taxCode: text("tax_code"),
    dimensions: jsonb("dimensions").$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.documentId, table.lineNumber] }),
    foreignKey({
      columns: [table.organizationId, table.documentId],
      foreignColumns: [commercialDocuments.organizationId, commercialDocuments.id],
      name: "commercial_document_lines_document_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.primaryAccountCode],
      foreignColumns: [accounts.organizationId, accounts.code],
      name: "commercial_document_lines_primary_account_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.taxAccountCode],
      foreignColumns: [accounts.organizationId, accounts.code],
      name: "commercial_document_lines_tax_account_fk",
    }).onDelete("restrict"),
    check("commercial_document_lines_description", sql`btrim(${table.description}) <> ''`),
    check(
      "commercial_document_lines_original_number",
      sql`${table.originalLineNumber} is null or ${table.originalLineNumber} > 0`,
    ),
    check("commercial_document_lines_quantity", sql`${table.quantity} > 0`),
    check(
      "commercial_document_lines_totals",
      sql`${table.unitPriceMinor} >= 0 and ${table.netMinor} > 0 and ${table.taxMinor} >= 0 and ${table.grossMinor} = ${table.netMinor} + ${table.taxMinor}`,
    ),
    check(
      "commercial_document_lines_tax_account",
      sql`(${table.taxMinor} = 0 and ${table.taxAccountCode} is null) or (${table.taxMinor} > 0 and ${table.taxAccountCode} is not null)`,
    ),
  ],
);

export const commercialDocumentAllocations = pgTable(
  "commercial_document_allocations",
  {
    organizationId: text("organization_id").notNull(),
    documentId: text("document_id").notNull(),
    lineNumber: integer("line_number").notNull(),
    allocationNumber: integer("allocation_number").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    dimensions: jsonb("dimensions").$type<Record<string, string>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.organizationId, table.documentId, table.lineNumber, table.allocationNumber],
    }),
    foreignKey({
      columns: [table.organizationId, table.documentId, table.lineNumber],
      foreignColumns: [
        commercialDocumentLines.organizationId,
        commercialDocumentLines.documentId,
        commercialDocumentLines.lineNumber,
      ],
      name: "commercial_document_allocations_line_fk",
    }).onDelete("restrict"),
    check("commercial_document_allocations_number", sql`${table.allocationNumber} > 0`),
    check("commercial_document_allocations_amount", sql`${table.amountMinor} > 0`),
    check(
      "commercial_document_allocations_dimensions",
      sql`jsonb_typeof(${table.dimensions}) = 'object' and ${table.dimensions} <> '{}'::jsonb`,
    ),
  ],
);

export const commercialDocumentEvents = pgTable(
  "commercial_document_events",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    documentId: text("document_id").notNull(),
    fromState: commercialDocumentState("from_state").notNull(),
    toState: commercialDocumentState("to_state").notNull(),
    actorId: text("actor_id").notNull(),
    reason: text("reason").notNull(),
    correlationId: text("correlation_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.documentId],
      foreignColumns: [commercialDocuments.organizationId, commercialDocuments.id],
      name: "commercial_document_events_document_fk",
    }).onDelete("restrict"),
    check("commercial_document_events_reason", sql`btrim(${table.reason}) <> ''`),
    check("commercial_document_events_transition", sql`${table.fromState} <> ${table.toState}`),
  ],
);

export const expenses = pgTable(
  "expenses",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    expenseClass: expenseClass("expense_class").notNull(),
    state: expenseState("state").notNull().default("draft"),
    payeePartyId: text("payee_party_id"),
    employeePartyId: text("employee_party_id"),
    expenseDate: date("expense_date").notNull(),
    servicePeriodStart: date("service_period_start"),
    servicePeriodEnd: date("service_period_end"),
    businessPurpose: text("business_purpose").notNull(),
    currency: text("currency").notNull(),
    netMinor: bigint("net_minor", { mode: "bigint" }).notNull(),
    vatMinor: bigint("vat_minor", { mode: "bigint" }).notNull(),
    grossMinor: bigint("gross_minor", { mode: "bigint" }).notNull(),
    counterAccountCode: text("counter_account_code").notNull(),
    citState: eligibilityState("cit_state").notNull().default("unreviewed"),
    vatState: eligibilityState("vat_state").notNull().default("unreviewed"),
    evidenceChecklist: jsonb("evidence_checklist")
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    journalId: text("journal_id"),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    createdBy: text("created_by").notNull(),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    postedBy: text("posted_by"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.payeePartyId],
      foreignColumns: [parties.organizationId, parties.id],
      name: "expenses_payee_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.employeePartyId],
      foreignColumns: [parties.organizationId, parties.id],
      name: "expenses_employee_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.counterAccountCode],
      foreignColumns: [accounts.organizationId, accounts.code],
      name: "expenses_counter_account_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.journalId],
      foreignColumns: [journalEntries.organizationId, journalEntries.id],
      name: "expenses_journal_fk",
    }).onDelete("restrict"),
    check("expenses_purpose_not_blank", sql`btrim(${table.businessPurpose}) <> ''`),
    check("expenses_currency_iso3", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "expenses_totals",
      sql`${table.netMinor} > 0 and ${table.vatMinor} >= 0 and ${table.grossMinor} = ${table.netMinor} + ${table.vatMinor}`,
    ),
    check(
      "expenses_service_period",
      sql`(${table.servicePeriodStart} is null and ${table.servicePeriodEnd} is null) or (${table.servicePeriodStart} is not null and ${table.servicePeriodEnd} is not null and ${table.servicePeriodStart} <= ${table.servicePeriodEnd})`,
    ),
    check(
      "expenses_reimbursement_employee",
      sql`${table.expenseClass} <> 'employee_reimbursement' or ${table.employeePartyId} is not null`,
    ),
    check(
      "expenses_noninvoice_vat",
      sql`${table.expenseClass} <> 'non_documented' or (${table.vatMinor} = 0 and ${table.vatState} in ('unreviewed','ineligible','accountant_override'))`,
    ),
    check("expenses_version_positive", sql`${table.version} > 0`),
  ],
);

export const expenseLines = pgTable(
  "expense_lines",
  {
    organizationId: text("organization_id").notNull(),
    expenseId: text("expense_id").notNull(),
    lineNumber: integer("line_number").notNull(),
    description: text("description").notNull(),
    netMinor: bigint("net_minor", { mode: "bigint" }).notNull(),
    vatMinor: bigint("vat_minor", { mode: "bigint" }).notNull(),
    grossMinor: bigint("gross_minor", { mode: "bigint" }).notNull(),
    postingAccountCode: text("posting_account_code").notNull(),
    vatAccountCode: text("vat_account_code"),
    managementState: managementValidityState("management_state").notNull().default("unreviewed"),
    citState: eligibilityState("cit_state").notNull().default("unreviewed"),
    vatState: eligibilityState("vat_state").notNull().default("unreviewed"),
    citEligibleMinor: bigint("cit_eligible_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    vatEligibleMinor: bigint("vat_eligible_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewReason: text("review_reason"),
    reviewReference: text("review_reference"),
    dimensions: jsonb("dimensions").$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.expenseId, table.lineNumber] }),
    foreignKey({
      columns: [table.organizationId, table.expenseId],
      foreignColumns: [expenses.organizationId, expenses.id],
      name: "expense_lines_expense_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.postingAccountCode],
      foreignColumns: [accounts.organizationId, accounts.code],
      name: "expense_lines_posting_account_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.vatAccountCode],
      foreignColumns: [accounts.organizationId, accounts.code],
      name: "expense_lines_vat_account_fk",
    }).onDelete("restrict"),
    check("expense_lines_number", sql`${table.lineNumber} > 0`),
    check("expense_lines_description", sql`btrim(${table.description}) <> ''`),
    check(
      "expense_lines_totals",
      sql`${table.netMinor} > 0 and ${table.vatMinor} >= 0 and ${table.grossMinor} = ${table.netMinor} + ${table.vatMinor}`,
    ),
    check(
      "expense_lines_vat_account",
      sql`(${table.vatMinor} = 0 and ${table.vatAccountCode} is null) or (${table.vatMinor} > 0 and ${table.vatAccountCode} is not null)`,
    ),
    check(
      "expense_lines_eligible_limits",
      sql`${table.citEligibleMinor} >= 0 and ${table.citEligibleMinor} <= ${table.grossMinor} and ${table.vatEligibleMinor} >= 0 and ${table.vatEligibleMinor} <= ${table.vatMinor}`,
    ),
    check(
      "expense_lines_review_metadata",
      sql`(${table.reviewedBy} is null and ${table.reviewedAt} is null and ${table.reviewReason} is null and ${table.reviewReference} is null) or (${table.reviewedBy} is not null and ${table.reviewedAt} is not null and ${table.reviewReason} is not null and btrim(${table.reviewReason}) <> '')`,
    ),
  ],
);

export const expenseAllocations = pgTable(
  "expense_allocations",
  {
    organizationId: text("organization_id").notNull(),
    expenseId: text("expense_id").notNull(),
    lineNumber: integer("line_number").notNull(),
    allocationNumber: integer("allocation_number").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    dimensions: jsonb("dimensions").$type<Record<string, string>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.organizationId, table.expenseId, table.lineNumber, table.allocationNumber],
    }),
    foreignKey({
      columns: [table.organizationId, table.expenseId, table.lineNumber],
      foreignColumns: [
        expenseLines.organizationId,
        expenseLines.expenseId,
        expenseLines.lineNumber,
      ],
      name: "expense_allocations_line_fk",
    }).onDelete("restrict"),
    check("expense_allocations_number", sql`${table.allocationNumber} > 0`),
    check("expense_allocations_amount", sql`${table.amountMinor} > 0`),
    check("expense_allocations_dimensions", sql`${table.dimensions} <> '{}'::jsonb`),
  ],
);

export const expenseEvents = pgTable(
  "expense_events",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    expenseId: text("expense_id").notNull(),
    action: text("action").notNull(),
    fromState: expenseState("from_state"),
    toState: expenseState("to_state"),
    actorId: text("actor_id").notNull(),
    reason: text("reason").notNull(),
    correlationId: text("correlation_id").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.expenseId],
      foreignColumns: [expenses.organizationId, expenses.id],
      name: "expense_events_expense_fk",
    }).onDelete("restrict"),
    check("expense_events_reason", sql`btrim(${table.reason}) <> ''`),
  ],
);

export const evidenceRecords = pgTable(
  "evidence_records",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    evidenceType: text("evidence_type").notNull(),
    currentVersion: integer("current_version").notNull().default(1),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    createdBy: text("created_by").notNull(),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    check(
      "evidence_records_subject_type",
      sql`${table.subjectType} in ('commercial_document','expense','contract','project','milestone')`,
    ),
    check("evidence_records_subject_not_blank", sql`btrim(${table.subjectId}) <> ''`),
    check("evidence_records_type_not_blank", sql`btrim(${table.evidenceType}) <> ''`),
    check("evidence_records_current_version", sql`${table.currentVersion} > 0`),
    check("evidence_records_version", sql`${table.version} > 0`),
  ],
);

export const evidenceVersions = pgTable(
  "evidence_versions",
  {
    organizationId: text("organization_id").notNull(),
    evidenceId: text("evidence_id").notNull(),
    versionNumber: integer("version_number").notNull(),
    status: evidenceVersionStatus("status").notNull().default("active"),
    reviewState: evidenceReviewState("review_state").notNull().default("pending"),
    objectBucket: text("object_bucket").notNull(),
    objectKey: text("object_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    declaredMediaType: text("declared_media_type").notNull(),
    detectedMediaType: text("detected_media_type").notNull(),
    byteSize: bigint("byte_size", { mode: "bigint" }).notNull(),
    sha256: text("sha256").notNull(),
    source: text("source").notNull(),
    supersedesVersion: integer("supersedes_version"),
    uploadedBy: text("uploaded_by").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewReason: text("review_reason"),
    reviewReference: text("review_reference"),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.evidenceId, table.versionNumber] }),
    foreignKey({
      columns: [table.organizationId, table.evidenceId],
      foreignColumns: [evidenceRecords.organizationId, evidenceRecords.id],
      name: "evidence_versions_record_fk",
    }).onDelete("restrict"),
    unique("evidence_versions_object_key_unique").on(table.organizationId, table.objectKey),
    check("evidence_versions_number", sql`${table.versionNumber} > 0`),
    check("evidence_versions_size", sql`${table.byteSize} > 0`),
    check("evidence_versions_sha256", sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
    check("evidence_versions_filename", sql`btrim(${table.originalFilename}) <> ''`),
    check(
      "evidence_versions_review_metadata",
      sql`(${table.reviewState} = 'pending' and ${table.reviewedBy} is null and ${table.reviewedAt} is null and ${table.reviewReason} is null) or (${table.reviewState} <> 'pending' and ${table.reviewedBy} is not null and ${table.reviewedAt} is not null and ${table.reviewReason} is not null and btrim(${table.reviewReason}) <> '')`,
    ),
  ],
);

export const evidenceAccessEvents = pgTable(
  "evidence_access_events",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    evidenceId: text("evidence_id").notNull(),
    versionNumber: integer("version_number").notNull(),
    action: text("action").notNull(),
    actorId: text("actor_id").notNull(),
    reason: text("reason"),
    correlationId: text("correlation_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.evidenceId, table.versionNumber],
      foreignColumns: [
        evidenceVersions.organizationId,
        evidenceVersions.evidenceId,
        evidenceVersions.versionNumber,
      ],
      name: "evidence_access_events_version_fk",
    }).onDelete("restrict"),
  ],
);

export const integrationSources = pgTable(
  "integration_sources",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    publicId: text("public_id").notNull(),
    name: text("name").notNull(),
    actorId: text("actor_id").notNull(),
    secretRef: text("secret_ref").notNull(),
    status: text("status").notNull().default("active"),
    allowedEventTypes: jsonb("allowed_event_types").$type<readonly string[]>().notNull(),
    timestampToleranceSeconds: integer("timestamp_tolerance_seconds").notNull().default(300),
    maxAttempts: integer("max_attempts").notNull().default(5),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    createdBy: text("created_by").notNull(),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("integration_sources_public_id_unique").on(table.publicId),
    check("integration_sources_status", sql`${table.status} in ('active','suspended','revoked')`),
    check(
      "integration_sources_tolerance",
      sql`${table.timestampToleranceSeconds} between 30 and 900`,
    ),
    check("integration_sources_attempts", sql`${table.maxAttempts} between 1 and 20`),
  ],
);

export const inboundMessages = pgTable(
  "inbound_messages",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    sourceId: text("source_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    externalId: text("external_id"),
    eventType: text("event_type"),
    schemaVersion: integer("schema_version"),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull(),
    correctedPayload: jsonb("corrected_payload").$type<Record<string, unknown>>(),
    payloadSha256: text("payload_sha256").notNull(),
    signatureTimestamp: bigint("signature_timestamp", { mode: "bigint" }).notNull(),
    state: inboundMessageState("state").notNull().default("received"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    lastErrorSummary: text("last_error_summary"),
    resultBody: jsonb("result_body").$type<Record<string, unknown>>(),
    correlationId: text("correlation_id").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.sourceId],
      foreignColumns: [integrationSources.organizationId, integrationSources.id],
      name: "inbound_messages_source_fk",
    }).onDelete("restrict"),
    unique("inbound_messages_idempotency_unique").on(
      table.organizationId,
      table.sourceId,
      table.idempotencyKey,
    ),
    unique("inbound_messages_external_unique").on(
      table.organizationId,
      table.sourceId,
      table.eventType,
      table.externalId,
    ),
    check("inbound_messages_hash", sql`${table.payloadSha256} ~ '^[0-9a-f]{64}$'`),
    check("inbound_messages_attempts", sql`${table.attemptCount} >= 0`),
  ],
);

export const inboundMessageAttempts = pgTable(
  "inbound_message_attempts",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    messageId: text("message_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    outcome: inboundAttemptOutcome("outcome").notNull(),
    actorId: text("actor_id").notNull(),
    reason: text("reason"),
    errorCode: text("error_code"),
    errorSummary: text("error_summary"),
    correlationId: text("correlation_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.messageId],
      foreignColumns: [inboundMessages.organizationId, inboundMessages.id],
      name: "inbound_attempts_message_fk",
    }).onDelete("restrict"),
    unique("inbound_attempts_number_unique").on(
      table.organizationId,
      table.messageId,
      table.attemptNumber,
    ),
    check("inbound_attempts_number", sql`${table.attemptNumber} > 0`),
  ],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    eventType: text("event_type").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    correlationId: text("correlation_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    check("outbox_schema_version_positive", sql`${table.schemaVersion} > 0`),
  ],
);

export const outboundWebhookSubscriptions = pgTable(
  "outbound_webhook_subscriptions",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    name: text("name").notNull(),
    endpointUrl: text("endpoint_url").notNull(),
    eventTypes: jsonb("event_types").$type<readonly string[]>().notNull().default([]),
    secretRef: text("secret_ref").notNull(),
    status: outboundSubscriptionStatus("status").notNull().default("active"),
    maxAttempts: integer("max_attempts").notNull().default(8),
    timeoutSeconds: integer("timeout_seconds").notNull().default(15),
    baseDelaySeconds: integer("base_delay_seconds").notNull().default(30),
    maxDelaySeconds: integer("max_delay_seconds").notNull().default(3600),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("outbound_subscriptions_name_unique").on(table.organizationId, table.name),
    check("outbound_subscription_name_not_blank", sql`btrim(${table.name}) <> ''`),
    check("outbound_subscription_endpoint_https", sql`${table.endpointUrl} ~ '^https://'`),
    check("outbound_subscription_secret_ref_not_blank", sql`btrim(${table.secretRef}) <> ''`),
    check(
      "outbound_subscription_event_types_array",
      sql`jsonb_typeof(${table.eventTypes}) = 'array'`,
    ),
    check("outbound_subscription_has_event_type", sql`jsonb_array_length(${table.eventTypes}) > 0`),
    check("outbound_subscription_max_attempts_positive", sql`${table.maxAttempts} > 0`),
    check("outbound_subscription_timeout_positive", sql`${table.timeoutSeconds} > 0`),
    check("outbound_subscription_base_delay_positive", sql`${table.baseDelaySeconds} > 0`),
    check(
      "outbound_subscription_delay_order",
      sql`${table.maxDelaySeconds} >= ${table.baseDelaySeconds}`,
    ),
  ],
);

export const outboundDeliveries = pgTable(
  "outbound_deliveries",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    outboxEventId: text("outbox_event_id").notNull(),
    subscriptionId: text("subscription_id").notNull(),
    state: outboundDeliveryState("state").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    leasedBy: text("leased_by"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
    lastHttpStatus: integer("last_http_status"),
    lastErrorCode: text("last_error_code"),
    lastErrorSummary: text("last_error_summary"),
    manualReplayCount: integer("manual_replay_count").notNull().default(0),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.outboxEventId],
      foreignColumns: [outboxEvents.organizationId, outboxEvents.id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.subscriptionId],
      foreignColumns: [
        outboundWebhookSubscriptions.organizationId,
        outboundWebhookSubscriptions.id,
      ],
    }).onDelete("restrict"),
    unique("outbound_delivery_event_subscription_unique").on(
      table.organizationId,
      table.outboxEventId,
      table.subscriptionId,
    ),
    check("outbound_delivery_attempt_count_nonnegative", sql`${table.attemptCount} >= 0`),
    check("outbound_delivery_replay_count_nonnegative", sql`${table.manualReplayCount} >= 0`),
    check(
      "outbound_delivery_lease_pair",
      sql`(${table.leasedBy} is null) = (${table.leaseExpiresAt} is null)`,
    ),
  ],
);

export const outboundDeliveryAttempts = pgTable(
  "outbound_delivery_attempts",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    deliveryId: text("delivery_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    outcome: outboundAttemptOutcome("outcome").notNull(),
    workerId: text("worker_id").notNull(),
    httpStatus: integer("http_status"),
    responseSummary: text("response_summary"),
    errorCode: text("error_code"),
    errorSummary: text("error_summary"),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    isManualReplay: boolean("is_manual_replay").notNull().default(false),
    replayActorId: text("replay_actor_id"),
    replayReason: text("replay_reason"),
    correlationId: text("correlation_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.deliveryId],
      foreignColumns: [outboundDeliveries.organizationId, outboundDeliveries.id],
    }).onDelete("restrict"),
    unique("outbound_attempts_number_unique").on(
      table.organizationId,
      table.deliveryId,
      table.attemptNumber,
    ),
    check("outbound_attempt_number_positive", sql`${table.attemptNumber} > 0`),
    check(
      "outbound_attempt_completed_after_start",
      sql`${table.completedAt} >= ${table.startedAt}`,
    ),
    check(
      "outbound_attempt_replay_metadata",
      sql`not ${table.isManualReplay} or (${table.replayActorId} is not null and btrim(${table.replayReason}) <> '')`,
    ),
  ],
);

export const financialAccounts = pgTable(
  "financial_accounts",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    code: text("code").notNull(),
    kind: financialAccountKind("kind").notNull(),
    displayName: text("display_name").notNull(),
    currency: text("currency").notNull(),
    ledgerAccountCode: text("ledger_account_code").notNull(),
    bankCode: text("bank_code"),
    maskedIdentifier: text("masked_identifier"),
    accountIdentityHash: text("account_identity_hash"),
    status: financialAccountStatus("status").notNull().default("active"),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("financial_accounts_org_code_unique").on(table.organizationId, table.code),
    uniqueIndex("financial_accounts_identity_unique")
      .on(table.organizationId, table.accountIdentityHash)
      .where(sql`${table.accountIdentityHash} is not null`),
    foreignKey({
      columns: [table.organizationId, table.ledgerAccountCode],
      foreignColumns: [accounts.organizationId, accounts.code],
      name: "financial_accounts_ledger_account_fk",
    }).onDelete("restrict"),
    check("financial_accounts_code_not_blank", sql`btrim(${table.code}) <> ''`),
    check("financial_accounts_name_not_blank", sql`btrim(${table.displayName}) <> ''`),
    check("financial_accounts_currency_iso3", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "financial_accounts_bank_metadata",
      sql`${table.kind} = 'cash' or (${table.bankCode} is not null and btrim(${table.bankCode}) <> '')`,
    ),
    check(
      "financial_accounts_identity_hash",
      sql`${table.accountIdentityHash} is null or ${table.accountIdentityHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check("financial_accounts_version_positive", sql`${table.version} > 0`),
  ],
);

export const bankStatementImports = pgTable(
  "bank_statement_imports",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    financialAccountId: text("financial_account_id").notNull(),
    adapterId: text("adapter_id").notNull(),
    adapterVersion: integer("adapter_version").notNull(),
    sourceFilename: text("source_filename").notNull(),
    contentSha256: text("content_sha256").notNull(),
    rowCount: integer("row_count").notNull(),
    importedCount: integer("imported_count").notNull(),
    duplicateCount: integer("duplicate_count").notNull(),
    rejectedCount: integer("rejected_count").notNull(),
    createdBy: text("created_by").notNull(),
    correlationId: text("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("bank_statement_import_content_unique").on(
      table.organizationId,
      table.financialAccountId,
      table.contentSha256,
    ),
    foreignKey({
      columns: [table.organizationId, table.financialAccountId],
      foreignColumns: [financialAccounts.organizationId, financialAccounts.id],
      name: "bank_statement_import_account_fk",
    }).onDelete("restrict"),
    check("bank_statement_import_adapter", sql`btrim(${table.adapterId}) <> ''`),
    check("bank_statement_import_adapter_version", sql`${table.adapterVersion} > 0`),
    check("bank_statement_import_filename", sql`btrim(${table.sourceFilename}) <> ''`),
    check("bank_statement_import_sha", sql`${table.contentSha256} ~ '^[0-9a-f]{64}$'`),
    check(
      "bank_statement_import_counts",
      sql`${table.rowCount} >= 0 and ${table.importedCount} >= 0 and ${table.duplicateCount} >= 0 and ${table.rejectedCount} >= 0 and ${table.rowCount} = ${table.importedCount} + ${table.duplicateCount} + ${table.rejectedCount}`,
    ),
  ],
);

export const bankStatementSessions = pgTable(
  "bank_statement_sessions",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    financialAccountId: text("financial_account_id").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    openingBalanceMinor: bigint("opening_balance_minor", { mode: "bigint" }).notNull(),
    closingBalanceMinor: bigint("closing_balance_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    state: bankStatementSessionState("state").notNull().default("draft"),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    createdBy: text("created_by").notNull(),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewReason: text("review_reason"),
    closedBy: text("closed_by"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closeReason: text("close_reason"),
    correlationId: text("correlation_id").notNull(),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("bank_statement_session_period_unique").on(
      table.organizationId,
      table.financialAccountId,
      table.periodStart,
      table.periodEnd,
    ),
    foreignKey({
      columns: [table.organizationId, table.financialAccountId],
      foreignColumns: [financialAccounts.organizationId, financialAccounts.id],
      name: "bank_statement_sessions_account_fk",
    }).onDelete("restrict"),
    check("bank_statement_session_period", sql`${table.periodEnd} >= ${table.periodStart}`),
    check("bank_statement_session_currency", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("bank_statement_session_version", sql`${table.version} > 0`),
    check(
      "bank_statement_session_close_metadata",
      sql`${table.state} <> 'closed' or (${table.closedBy} is not null and ${table.closedAt} is not null and ${table.closeReason} is not null and btrim(${table.closeReason}) <> '')`,
    ),
    index("bank_statement_sessions_account_period_idx").on(
      table.organizationId,
      table.financialAccountId,
      table.periodStart,
      table.periodEnd,
    ),
  ],
);

export const bankStatementSessionImports = pgTable(
  "bank_statement_session_imports",
  {
    organizationId: text("organization_id").notNull(),
    sessionId: text("session_id").notNull(),
    importId: text("import_id").notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.sessionId, table.importId] }),
    unique("bank_statement_session_import_once").on(table.organizationId, table.importId),
    foreignKey({
      columns: [table.organizationId, table.sessionId],
      foreignColumns: [bankStatementSessions.organizationId, bankStatementSessions.id],
      name: "bank_statement_session_imports_session_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.importId],
      foreignColumns: [bankStatementImports.organizationId, bankStatementImports.id],
      name: "bank_statement_session_imports_import_fk",
    }).onDelete("restrict"),
  ],
);

export const bankTransactions = pgTable(
  "bank_transactions",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    financialAccountId: text("financial_account_id").notNull(),
    providerTransactionId: text("provider_transaction_id"),
    fingerprint: text("fingerprint").notNull(),
    fingerprintVersion: integer("fingerprint_version").notNull().default(1),
    bookingDate: date("booking_date").notNull(),
    valueDate: date("value_date"),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    reference: text("reference"),
    description: text("description").notNull(),
    counterpartyName: text("counterparty_name"),
    state: bankTransactionState("state").notNull().default("imported"),
    currentNormalizationVersion: integer("current_normalization_version").notNull().default(1),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("bank_transaction_fingerprint_unique").on(
      table.organizationId,
      table.financialAccountId,
      table.fingerprint,
    ),
    uniqueIndex("bank_transaction_provider_id_unique")
      .on(table.organizationId, table.financialAccountId, table.providerTransactionId)
      .where(sql`${table.providerTransactionId} is not null`),
    foreignKey({
      columns: [table.organizationId, table.financialAccountId],
      foreignColumns: [financialAccounts.organizationId, financialAccounts.id],
      name: "bank_transactions_account_fk",
    }).onDelete("restrict"),
    check("bank_transaction_fingerprint", sql`${table.fingerprint} ~ '^[0-9a-f]{64}$'`),
    check("bank_transaction_fingerprint_version", sql`${table.fingerprintVersion} > 0`),
    check("bank_transaction_amount_nonzero", sql`${table.amountMinor} <> 0`),
    check("bank_transaction_currency_iso3", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("bank_transaction_description", sql`btrim(${table.description}) <> ''`),
    check("bank_transaction_normalization_version", sql`${table.currentNormalizationVersion} > 0`),
    check("bank_transaction_version", sql`${table.version} > 0`),
  ],
);

export const bankTransactionNormalizations = pgTable(
  "bank_transaction_normalizations",
  {
    organizationId: text("organization_id").notNull(),
    transactionId: text("transaction_id").notNull(),
    version: integer("version").notNull(),
    adapterId: text("adapter_id").notNull(),
    adapterVersion: integer("adapter_version").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    normalizedPayload: jsonb("normalized_payload").$type<Record<string, unknown>>().notNull(),
    normalizedSha256: text("normalized_sha256").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.transactionId, table.version] }),
    foreignKey({
      columns: [table.organizationId, table.transactionId],
      foreignColumns: [bankTransactions.organizationId, bankTransactions.id],
      name: "bank_transaction_normalization_transaction_fk",
    }).onDelete("restrict"),
    check("bank_transaction_normalization_version", sql`${table.version} > 0`),
    check("bank_transaction_normalization_adapter_version", sql`${table.adapterVersion} > 0`),
    check("bank_transaction_normalization_schema_version", sql`${table.schemaVersion} > 0`),
    check("bank_transaction_normalization_sha", sql`${table.normalizedSha256} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const bankStatementImportRows = pgTable(
  "bank_statement_import_rows",
  {
    organizationId: text("organization_id").notNull(),
    importId: text("import_id").notNull(),
    rowNumber: integer("row_number").notNull(),
    rawPayload: jsonb("raw_payload").$type<Record<string, string>>().notNull(),
    rawSha256: text("raw_sha256").notNull(),
    outcome: bankImportRowOutcome("outcome").notNull(),
    errorCodes: jsonb("error_codes").$type<readonly string[]>().notNull().default([]),
    transactionId: text("transaction_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.importId, table.rowNumber] }),
    foreignKey({
      columns: [table.organizationId, table.importId],
      foreignColumns: [bankStatementImports.organizationId, bankStatementImports.id],
      name: "bank_statement_import_rows_import_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.transactionId],
      foreignColumns: [bankTransactions.organizationId, bankTransactions.id],
      name: "bank_statement_import_rows_transaction_fk",
    }).onDelete("restrict"),
    check("bank_statement_import_row_number", sql`${table.rowNumber} > 0`),
    check("bank_statement_import_row_sha", sql`${table.rawSha256} ~ '^[0-9a-f]{64}$'`),
    check(
      "bank_statement_import_row_transaction",
      sql`(${table.outcome} = 'rejected' and ${table.transactionId} is null) or (${table.outcome} <> 'rejected' and ${table.transactionId} is not null)`,
    ),
  ],
);

export const bankTransactionEvents = pgTable(
  "bank_transaction_events",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    transactionId: text("transaction_id").notNull(),
    action: text("action").notNull(),
    fromState: bankTransactionState("from_state"),
    toState: bankTransactionState("to_state").notNull(),
    actorId: text("actor_id").notNull(),
    reason: text("reason").notNull(),
    correlationId: text("correlation_id").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.transactionId],
      foreignColumns: [bankTransactions.organizationId, bankTransactions.id],
      name: "bank_transaction_events_transaction_fk",
    }).onDelete("restrict"),
    check("bank_transaction_event_action", sql`btrim(${table.action}) <> ''`),
    check("bank_transaction_event_reason", sql`btrim(${table.reason}) <> ''`),
  ],
);

export const reconciliationCandidateRuns = pgTable(
  "reconciliation_candidate_runs",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    bankTransactionId: text("bank_transaction_id").notNull(),
    algorithmVersion: integer("algorithm_version").notNull().default(1),
    thresholdBps: integer("threshold_bps").notNull(),
    ambiguityMarginBps: integer("ambiguity_margin_bps").notNull(),
    createdBy: text("created_by").notNull(),
    correlationId: text("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.bankTransactionId],
      foreignColumns: [bankTransactions.organizationId, bankTransactions.id],
      name: "reconciliation_candidate_runs_transaction_fk",
    }).onDelete("restrict"),
    check("reconciliation_candidate_algorithm", sql`${table.algorithmVersion} > 0`),
    check("reconciliation_candidate_threshold", sql`${table.thresholdBps} between 0 and 10000`),
    check("reconciliation_candidate_margin", sql`${table.ambiguityMarginBps} between 0 and 10000`),
  ],
);

export const reconciliationCandidates = pgTable(
  "reconciliation_candidates",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    runId: text("run_id").notNull(),
    rank: integer("rank").notNull(),
    targetType: reconciliationTargetType("target_type").notNull(),
    commercialDocumentId: text("commercial_document_id"),
    expenseId: text("expense_id"),
    confidenceBps: integer("confidence_bps").notNull(),
    factors: jsonb("factors").$type<Record<string, number | boolean | string>>().notNull(),
    outstandingMinor: bigint("outstanding_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    status: reconciliationCandidateStatus("status").notNull().default("proposed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("reconciliation_candidate_run_rank_unique").on(
      table.organizationId,
      table.runId,
      table.rank,
    ),
    foreignKey({
      columns: [table.organizationId, table.runId],
      foreignColumns: [reconciliationCandidateRuns.organizationId, reconciliationCandidateRuns.id],
      name: "reconciliation_candidates_run_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.commercialDocumentId],
      foreignColumns: [commercialDocuments.organizationId, commercialDocuments.id],
      name: "reconciliation_candidates_document_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.expenseId],
      foreignColumns: [expenses.organizationId, expenses.id],
      name: "reconciliation_candidates_expense_fk",
    }).onDelete("restrict"),
    check("reconciliation_candidate_rank", sql`${table.rank} > 0`),
    check("reconciliation_candidate_confidence", sql`${table.confidenceBps} between 0 and 10000`),
    check("reconciliation_candidate_outstanding", sql`${table.outstandingMinor} > 0`),
    check("reconciliation_candidate_currency", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "reconciliation_candidate_target",
      sql`(${table.targetType} = 'commercial_document' and ${table.commercialDocumentId} is not null and ${table.expenseId} is null) or (${table.targetType} = 'expense' and ${table.expenseId} is not null and ${table.commercialDocumentId} is null)`,
    ),
  ],
);

export const paymentReconciliations = pgTable(
  "payment_reconciliations",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    bankTransactionId: text("bank_transaction_id").notNull(),
    direction: text("direction").notNull(),
    statementAmountMinor: bigint("statement_amount_minor", { mode: "bigint" }).notNull(),
    statementCurrency: text("statement_currency").notNull(),
    currentAttemptNumber: integer("current_attempt_number").notNull().default(0),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    createdBy: text("created_by").notNull(),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("payment_reconciliation_transaction_unique").on(
      table.organizationId,
      table.bankTransactionId,
    ),
    foreignKey({
      columns: [table.organizationId, table.bankTransactionId],
      foreignColumns: [bankTransactions.organizationId, bankTransactions.id],
      name: "payment_reconciliations_transaction_fk",
    }).onDelete("restrict"),
    check("payment_reconciliation_direction", sql`${table.direction} in ('receipt','payment')`),
    check("payment_reconciliation_statement_amount", sql`${table.statementAmountMinor} > 0`),
    check("payment_reconciliation_currency", sql`${table.statementCurrency} ~ '^[A-Z]{3}$'`),
    check("payment_reconciliation_attempt_number", sql`${table.currentAttemptNumber} >= 0`),
    check("payment_reconciliation_version", sql`${table.version} > 0`),
  ],
);

export const reconciliationAttempts = pgTable(
  "reconciliation_attempts",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    reconciliationId: text("reconciliation_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    bankTransactionId: text("bank_transaction_id").notNull(),
    state: reconciliationAttemptState("state").notNull().default("matched"),
    bankAmountMinor: bigint("bank_amount_minor", { mode: "bigint" }).notNull(),
    bankCurrency: text("bank_currency").notNull(),
    baseAmountMinor: bigint("base_amount_minor", { mode: "bigint" }).notNull(),
    exchangeRateId: text("exchange_rate_id"),
    candidateRunId: text("candidate_run_id"),
    policyVersion: integer("policy_version").notNull().default(1),
    candidateGeneration: integer("candidate_generation").notNull(),
    manualOverride: boolean("manual_override").notNull().default(false),
    overrideReason: text("override_reason"),
    overrideReference: text("override_reference"),
    journalId: text("journal_id"),
    reversalJournalId: text("reversal_journal_id"),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    createdBy: text("created_by").notNull(),
    matchedAt: timestamp("matched_at", { withTimezone: true }).notNull().defaultNow(),
    reconciledBy: text("reconciled_by"),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    reconciledReason: text("reconciled_reason"),
    unreconciledBy: text("unreconciled_by"),
    unreconciledAt: timestamp("unreconciled_at", { withTimezone: true }),
    unreconciledReason: text("unreconciled_reason"),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("reconciliation_attempt_number_unique").on(
      table.organizationId,
      table.reconciliationId,
      table.attemptNumber,
    ),
    uniqueIndex("reconciliation_attempt_active_transaction_unique")
      .on(table.organizationId, table.bankTransactionId)
      .where(sql`${table.state} in ('matched','reconciled')`),
    foreignKey({
      columns: [table.organizationId, table.reconciliationId],
      foreignColumns: [paymentReconciliations.organizationId, paymentReconciliations.id],
      name: "reconciliation_attempts_parent_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.bankTransactionId],
      foreignColumns: [bankTransactions.organizationId, bankTransactions.id],
      name: "reconciliation_attempts_transaction_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.exchangeRateId],
      foreignColumns: [exchangeRates.organizationId, exchangeRates.id],
      name: "reconciliation_attempts_exchange_rate_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.candidateRunId],
      foreignColumns: [reconciliationCandidateRuns.organizationId, reconciliationCandidateRuns.id],
      name: "reconciliation_attempts_candidate_run_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.journalId],
      foreignColumns: [journalEntries.organizationId, journalEntries.id],
      name: "reconciliation_attempts_journal_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.reversalJournalId],
      foreignColumns: [journalEntries.organizationId, journalEntries.id],
      name: "reconciliation_attempts_reversal_journal_fk",
    }).onDelete("restrict"),
    check("reconciliation_attempt_bank_amount", sql`${table.bankAmountMinor} > 0`),
    check("reconciliation_attempt_base_amount", sql`${table.baseAmountMinor} > 0`),
    check("reconciliation_attempt_currency", sql`${table.bankCurrency} ~ '^[A-Z]{3}$'`),
    check("reconciliation_attempt_version", sql`${table.version} > 0`),
    check("reconciliation_attempt_number", sql`${table.attemptNumber} > 0`),
    check("reconciliation_attempt_policy", sql`${table.policyVersion} > 0`),
    check("reconciliation_attempt_generation", sql`${table.candidateGeneration} > 0`),
    check(
      "reconciliation_attempt_override",
      sql`not ${table.manualOverride} or (${table.overrideReason} is not null and btrim(${table.overrideReason}) <> '')`,
    ),
  ],
);

export const reconciliationAllocations = pgTable(
  "reconciliation_allocations",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    lineNumber: integer("line_number").notNull(),
    reconciliationId: text("reconciliation_id").notNull(),
    targetType: reconciliationTargetType("target_type").notNull(),
    commercialDocumentId: text("commercial_document_id"),
    expenseId: text("expense_id"),
    targetAmountMinor: bigint("target_amount_minor", { mode: "bigint" }).notNull(),
    targetCurrency: text("target_currency").notNull(),
    baseAmountMinor: bigint("base_amount_minor", { mode: "bigint" }).notNull(),
    statementAmountMinor: bigint("statement_amount_minor", { mode: "bigint" }).notNull(),
    targetOutstandingBeforeMinor: bigint("target_outstanding_before_minor", {
      mode: "bigint",
    }).notNull(),
    exchangeRateId: text("exchange_rate_id"),
    controlAccountCode: text("control_account_code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.reconciliationId],
      foreignColumns: [reconciliationAttempts.organizationId, reconciliationAttempts.id],
      name: "reconciliation_allocations_attempt_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.commercialDocumentId],
      foreignColumns: [commercialDocuments.organizationId, commercialDocuments.id],
      name: "reconciliation_allocations_document_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.expenseId],
      foreignColumns: [expenses.organizationId, expenses.id],
      name: "reconciliation_allocations_expense_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.controlAccountCode],
      foreignColumns: [accounts.organizationId, accounts.code],
      name: "reconciliation_allocations_account_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.exchangeRateId],
      foreignColumns: [exchangeRates.organizationId, exchangeRates.id],
      name: "reconciliation_allocations_exchange_rate_fk",
    }).onDelete("restrict"),
    unique("reconciliation_allocation_line_unique").on(
      table.organizationId,
      table.reconciliationId,
      table.lineNumber,
    ),
    check("reconciliation_allocation_line", sql`${table.lineNumber} > 0`),
    check("reconciliation_allocation_target_amount", sql`${table.targetAmountMinor} > 0`),
    check("reconciliation_allocation_base_amount", sql`${table.baseAmountMinor} > 0`),
    check("reconciliation_allocation_statement_amount", sql`${table.statementAmountMinor} > 0`),
    check("reconciliation_allocation_outstanding", sql`${table.targetOutstandingBeforeMinor} > 0`),
    check("reconciliation_allocation_currency", sql`${table.targetCurrency} ~ '^[A-Z]{3}$'`),
    check(
      "reconciliation_allocation_target",
      sql`(${table.targetType} = 'commercial_document' and ${table.commercialDocumentId} is not null and ${table.expenseId} is null) or (${table.targetType} = 'expense' and ${table.expenseId} is not null and ${table.commercialDocumentId} is null)`,
    ),
  ],
);

export const reconciliationAdjustments = pgTable(
  "reconciliation_adjustments",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    lineNumber: integer("line_number").notNull(),
    reconciliationId: text("reconciliation_id").notNull(),
    kind: reconciliationAdjustmentKind("kind").notNull(),
    baseAmountMinor: bigint("base_amount_minor", { mode: "bigint" }).notNull(),
    statementAmountMinor: bigint("statement_amount_minor", { mode: "bigint" }).notNull(),
    accountCode: text("account_code").notNull(),
    side: journalSide("side").notNull(),
    description: text("description").notNull(),
    exchangeRateId: text("exchange_rate_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.reconciliationId],
      foreignColumns: [reconciliationAttempts.organizationId, reconciliationAttempts.id],
      name: "reconciliation_adjustments_attempt_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.accountCode],
      foreignColumns: [accounts.organizationId, accounts.code],
      name: "reconciliation_adjustments_account_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.exchangeRateId],
      foreignColumns: [exchangeRates.organizationId, exchangeRates.id],
      name: "reconciliation_adjustments_exchange_rate_fk",
    }).onDelete("restrict"),
    unique("reconciliation_adjustment_line_unique").on(
      table.organizationId,
      table.reconciliationId,
      table.lineNumber,
    ),
    check("reconciliation_adjustment_line", sql`${table.lineNumber} > 0`),
    check("reconciliation_adjustment_amount", sql`${table.baseAmountMinor} > 0`),
    check("reconciliation_adjustment_statement_amount", sql`${table.statementAmountMinor} >= 0`),
    check("reconciliation_adjustment_description", sql`btrim(${table.description}) <> ''`),
  ],
);

export const bankControlExceptions = pgTable(
  "bank_control_exceptions",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    sessionId: text("session_id").notNull(),
    bankTransactionId: text("bank_transaction_id"),
    kind: bankControlExceptionKind("kind").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    ownerId: text("owner_id").notNull(),
    reason: text("reason").notNull(),
    reviewDue: date("review_due").notNull(),
    status: bankControlExceptionStatus("status").notNull().default("pending"),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    createdBy: text("created_by").notNull(),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvalReason: text("approval_reason"),
    resolvedBy: text("resolved_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionReference: text("resolution_reference"),
    resolutionReason: text("resolution_reason"),
    rejectedBy: text("rejected_by"),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    correlationId: text("correlation_id").notNull(),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.sessionId],
      foreignColumns: [bankStatementSessions.organizationId, bankStatementSessions.id],
      name: "bank_control_exceptions_session_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.bankTransactionId],
      foreignColumns: [bankTransactions.organizationId, bankTransactions.id],
      name: "bank_control_exceptions_transaction_fk",
    }).onDelete("restrict"),
    check("bank_control_exception_amount", sql`${table.amountMinor} <> 0`),
    check("bank_control_exception_currency", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("bank_control_exception_owner", sql`btrim(${table.ownerId}) <> ''`),
    check("bank_control_exception_reason", sql`btrim(${table.reason}) <> ''`),
    check("bank_control_exception_version", sql`${table.version} > 0`),
    check(
      "bank_control_exception_approval",
      sql`${table.status} <> 'approved' or (${table.approvedBy} is not null and ${table.approvedAt} is not null and ${table.approvalReason} is not null and btrim(${table.approvalReason}) <> '')`,
    ),
    check(
      "bank_control_exception_resolution",
      sql`${table.status} <> 'resolved' or (${table.resolvedBy} is not null and ${table.resolvedAt} is not null and ${table.resolutionReference} is not null and btrim(${table.resolutionReference}) <> '' and ${table.resolutionReason} is not null and btrim(${table.resolutionReason}) <> '')`,
    ),
    check(
      "bank_control_exception_rejection",
      sql`${table.status} <> 'rejected' or (${table.rejectedBy} is not null and ${table.rejectedAt} is not null and ${table.rejectionReason} is not null and btrim(${table.rejectionReason}) <> '')`,
    ),
    index("bank_control_exceptions_session_status_idx").on(
      table.organizationId,
      table.sessionId,
      table.status,
    ),
  ],
);

export const reconciliationEvents = pgTable(
  "reconciliation_events",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    reconciliationId: text("reconciliation_id"),
    bankTransactionId: text("bank_transaction_id").notNull(),
    action: text("action").notNull(),
    fromState: text("from_state"),
    toState: text("to_state").notNull(),
    actorId: text("actor_id").notNull(),
    reason: text("reason").notNull(),
    correlationId: text("correlation_id").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.reconciliationId],
      foreignColumns: [reconciliationAttempts.organizationId, reconciliationAttempts.id],
      name: "reconciliation_events_attempt_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.bankTransactionId],
      foreignColumns: [bankTransactions.organizationId, bankTransactions.id],
      name: "reconciliation_events_transaction_fk",
    }).onDelete("restrict"),
    check("reconciliation_event_action", sql`btrim(${table.action}) <> ''`),
    check("reconciliation_event_reason", sql`btrim(${table.reason}) <> ''`),
  ],
);

export const internalTransfers = pgTable(
  "internal_transfers",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    state: internalTransferState("state").notNull().default("pending_counterpart"),
    currency: text("currency").notNull(),
    transferAmountMinor: bigint("transfer_amount_minor", { mode: "bigint" }).notNull(),
    basePrincipalAmountMinor: bigint("base_principal_amount_minor", { mode: "bigint" }).notNull(),
    transitAccountCode: text("transit_account_code").notNull(),
    currentAttemptNumber: integer("current_attempt_number").notNull().default(1),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    createdBy: text("created_by").notNull(),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.transitAccountCode],
      foreignColumns: [accounts.organizationId, accounts.code],
      name: "internal_transfers_transit_account_fk",
    }).onDelete("restrict"),
    check("internal_transfer_currency", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("internal_transfer_amount", sql`${table.transferAmountMinor} > 0`),
    check("internal_transfer_attempt_number", sql`${table.currentAttemptNumber} > 0`),
    check("internal_transfer_version", sql`${table.version} > 0`),
    index("internal_transfers_state_idx").on(table.organizationId, table.state),
    index("internal_transfers_updated_idx").on(table.organizationId, table.updatedAt),
  ],
);

export const internalTransferAttempts = pgTable(
  "internal_transfer_attempts",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    transferId: text("transfer_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    state: internalTransferAttemptState("state").notNull(),
    postingMode: text("posting_mode").notNull().default("transit"),
    fee: jsonb("fee").$type<Record<string, unknown>>(),
    outgoingTransactionId: text("outgoing_transaction_id"),
    incomingTransactionId: text("incoming_transaction_id"),
    feeTransactionId: text("fee_transaction_id"),
    outgoingJournalId: text("outgoing_journal_id"),
    incomingJournalId: text("incoming_journal_id"),
    outgoingReversalJournalId: text("outgoing_reversal_journal_id"),
    incomingReversalJournalId: text("incoming_reversal_journal_id"),
    feeReversalJournalId: text("fee_reversal_journal_id"),
    manualOverrideReason: text("manual_override_reason"),
    matchedBy: text("matched_by"),
    matchedAt: timestamp("matched_at", { withTimezone: true }),
    unmatchedBy: text("unmatched_by"),
    unmatchedAt: timestamp("unmatched_at", { withTimezone: true }),
    unmatchedReason: text("unmatched_reason"),
    correlationId: text("correlation_id").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("internal_transfer_attempt_number_unique").on(
      table.organizationId,
      table.transferId,
      table.attemptNumber,
    ),
    foreignKey({
      columns: [table.organizationId, table.transferId],
      foreignColumns: [internalTransfers.organizationId, internalTransfers.id],
      name: "internal_transfer_attempts_transfer_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.outgoingTransactionId],
      foreignColumns: [bankTransactions.organizationId, bankTransactions.id],
      name: "internal_transfer_attempts_outgoing_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.incomingTransactionId],
      foreignColumns: [bankTransactions.organizationId, bankTransactions.id],
      name: "internal_transfer_attempts_incoming_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.feeTransactionId],
      foreignColumns: [bankTransactions.organizationId, bankTransactions.id],
      name: "internal_transfer_attempts_fee_transaction_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.outgoingJournalId],
      foreignColumns: [journalEntries.organizationId, journalEntries.id],
      name: "internal_transfer_attempts_outgoing_journal_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.incomingJournalId],
      foreignColumns: [journalEntries.organizationId, journalEntries.id],
      name: "internal_transfer_attempts_incoming_journal_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.outgoingReversalJournalId],
      foreignColumns: [journalEntries.organizationId, journalEntries.id],
      name: "internal_transfer_attempts_outgoing_reversal_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.incomingReversalJournalId],
      foreignColumns: [journalEntries.organizationId, journalEntries.id],
      name: "internal_transfer_attempts_incoming_reversal_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.feeReversalJournalId],
      foreignColumns: [journalEntries.organizationId, journalEntries.id],
      name: "internal_transfer_attempts_fee_reversal_fk",
    }).onDelete("restrict"),
    check("internal_transfer_attempt_number", sql`${table.attemptNumber} > 0`),
    check(
      "internal_transfer_attempt_posting_mode",
      sql`${table.postingMode} in ('direct','transit')`,
    ),
    check(
      "internal_transfer_attempt_has_leg",
      sql`${table.outgoingTransactionId} is not null or ${table.incomingTransactionId} is not null`,
    ),
    check(
      "internal_transfer_attempt_distinct_legs",
      sql`${table.outgoingTransactionId} is null or ${table.incomingTransactionId} is null or ${table.outgoingTransactionId} <> ${table.incomingTransactionId}`,
    ),
    check(
      "internal_transfer_attempt_matched_legs",
      sql`${table.state} not in ('matched','reconciled') or (${table.outgoingTransactionId} is not null and ${table.incomingTransactionId} is not null and ${table.matchedBy} is not null and ${table.matchedAt} is not null)`,
    ),
    check(
      "internal_transfer_attempt_unmatched_metadata",
      sql`${table.state} <> 'unmatched' or (${table.unmatchedBy} is not null and ${table.unmatchedAt} is not null and ${table.unmatchedReason} is not null and btrim(${table.unmatchedReason}) <> '')`,
    ),
    index("internal_transfer_attempts_transfer_idx").on(
      table.organizationId,
      table.transferId,
      table.attemptNumber,
    ),
    index("internal_transfer_attempts_outgoing_idx").on(
      table.organizationId,
      table.outgoingTransactionId,
    ),
    index("internal_transfer_attempts_incoming_idx").on(
      table.organizationId,
      table.incomingTransactionId,
    ),
    index("internal_transfer_attempts_fee_idx").on(table.organizationId, table.feeTransactionId),
  ],
);

export const internalTransferClaims = pgTable(
  "internal_transfer_claims",
  {
    organizationId: text("organization_id").notNull(),
    bankTransactionId: text("bank_transaction_id").notNull(),
    transferId: text("transfer_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.bankTransactionId] }),
    foreignKey({
      columns: [table.organizationId, table.bankTransactionId],
      foreignColumns: [bankTransactions.organizationId, bankTransactions.id],
      name: "internal_transfer_claims_transaction_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.transferId, table.attemptNumber],
      foreignColumns: [
        internalTransferAttempts.organizationId,
        internalTransferAttempts.transferId,
        internalTransferAttempts.attemptNumber,
      ],
      name: "internal_transfer_claims_attempt_fk",
    }).onDelete("restrict"),
    check("internal_transfer_claim_role", sql`${table.role} in ('source','destination','fee')`),
    index("internal_transfer_claims_transfer_idx").on(
      table.organizationId,
      table.transferId,
      table.attemptNumber,
    ),
  ],
);

export const internalTransferCandidateRuns = pgTable(
  "internal_transfer_candidate_runs",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    bankTransactionId: text("bank_transaction_id").notNull(),
    createdBy: text("created_by").notNull(),
    correlationId: text("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.bankTransactionId],
      foreignColumns: [bankTransactions.organizationId, bankTransactions.id],
      name: "internal_transfer_candidate_runs_transaction_fk",
    }).onDelete("restrict"),
  ],
);

export const internalTransferCandidates = pgTable(
  "internal_transfer_candidates",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    runId: text("run_id").notNull(),
    counterpartTransactionId: text("counterpart_transaction_id").notNull(),
    scoreBps: integer("score_bps").notNull(),
    factors: jsonb("factors").$type<Record<string, number | boolean>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("internal_transfer_candidate_counterpart_unique").on(
      table.organizationId,
      table.runId,
      table.counterpartTransactionId,
    ),
    foreignKey({
      columns: [table.organizationId, table.runId],
      foreignColumns: [
        internalTransferCandidateRuns.organizationId,
        internalTransferCandidateRuns.id,
      ],
      name: "internal_transfer_candidates_run_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.counterpartTransactionId],
      foreignColumns: [bankTransactions.organizationId, bankTransactions.id],
      name: "internal_transfer_candidates_counterpart_fk",
    }).onDelete("restrict"),
    check("internal_transfer_candidate_score", sql`${table.scoreBps} between 0 and 10000`),
  ],
);

export const internalTransferEvents = pgTable(
  "internal_transfer_events",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    transferId: text("transfer_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    action: text("action").notNull(),
    actorId: text("actor_id").notNull(),
    reason: text("reason").notNull(),
    correlationId: text("correlation_id").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.transferId, table.attemptNumber],
      foreignColumns: [
        internalTransferAttempts.organizationId,
        internalTransferAttempts.transferId,
        internalTransferAttempts.attemptNumber,
      ],
      name: "internal_transfer_events_attempt_fk",
    }).onDelete("restrict"),
    check("internal_transfer_event_action", sql`btrim(${table.action}) <> ''`),
    check("internal_transfer_event_reason", sql`btrim(${table.reason}) <> ''`),
  ],
);

export const revenueTargetVersions = pgTable(
  "revenue_target_versions",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    versionNumber: integer("version_number").notNull(),
    previousVersionId: text("previous_version_id"),
    periodKind: targetPeriodKind("period_kind").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    actualBasis: planningActualBasis("actual_basis").notNull(),
    currency: text("currency").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    teamId: text("team_id"),
    serviceLineCode: text("service_line_code"),
    ownerId: text("owner_id"),
    state: planningVersionState("state").notNull().default("draft"),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    reason: text("reason").notNull(),
    createdBy: text("created_by").notNull(),
    publishedBy: text("published_by"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.previousVersionId],
      foreignColumns: [table.organizationId, table.id],
      name: "revenue_target_previous_fk",
    }).onDelete("restrict"),
    check("revenue_target_version_positive", sql`${table.versionNumber} > 0`),
    check("revenue_target_amount_nonnegative", sql`${table.amountMinor} >= 0`),
    check("revenue_target_date_order", sql`${table.endsOn} >= ${table.startsOn}`),
    check("revenue_target_currency", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("revenue_target_reason", sql`btrim(${table.reason}) <> ''`),
    index("revenue_target_period_idx").on(table.organizationId, table.startsOn, table.endsOn),
  ],
);

export const forecastVersions = pgTable(
  "forecast_versions",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    versionNumber: integer("version_number").notNull(),
    previousVersionId: text("previous_version_id"),
    scenario: forecastScenario("scenario").notNull(),
    customScenarioName: text("custom_scenario_name"),
    snapshotKind: forecastSnapshotKind("snapshot_kind").notNull(),
    asOfDate: date("as_of_date").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    actualBasis: planningActualBasis("actual_basis").notNull(),
    currency: text("currency").notNull(),
    teamId: text("team_id"),
    serviceLineCode: text("service_line_code"),
    ownerId: text("owner_id"),
    state: planningVersionState("state").notNull().default("draft"),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    reason: text("reason").notNull(),
    createdBy: text("created_by").notNull(),
    publishedBy: text("published_by"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    compositionSnapshot: jsonb("composition_snapshot").$type<Record<string, unknown>>(),
    compositionSnapshottedAt: timestamp("composition_snapshotted_at", { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.previousVersionId],
      foreignColumns: [table.organizationId, table.id],
      name: "forecast_previous_fk",
    }).onDelete("restrict"),
    check("forecast_version_positive", sql`${table.versionNumber} > 0`),
    check("forecast_date_order", sql`${table.endsOn} >= ${table.startsOn}`),
    check("forecast_as_of_range", sql`${table.asOfDate} <= ${table.endsOn}`),
    check("forecast_currency", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("forecast_reason", sql`btrim(${table.reason}) <> ''`),
    check(
      "forecast_composition_snapshot_pair",
      sql`(${table.compositionSnapshot} is null and ${table.compositionSnapshottedAt} is null) or (${table.compositionSnapshot} is not null and ${table.compositionSnapshottedAt} is not null)`,
    ),
    check(
      "forecast_custom_name",
      sql`(${table.scenario} = 'custom' and ${table.customScenarioName} is not null and btrim(${table.customScenarioName}) <> '') or (${table.scenario} <> 'custom' and ${table.customScenarioName} is null)`,
    ),
    index("forecast_period_idx").on(
      table.organizationId,
      table.startsOn,
      table.endsOn,
      table.asOfDate,
    ),
  ],
);

export const forecastComponents = pgTable(
  "forecast_components",
  {
    organizationId: text("organization_id").notNull(),
    forecastVersionId: text("forecast_version_id").notNull(),
    id: text("id").notNull(),
    section: forecastComponentSection("section").notNull(),
    kind: text("kind").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    direction: forecastComponentDirection("direction").notNull(),
    probabilityBps: integer("probability_bps").notNull().default(10000),
    scheduledOn: date("scheduled_on"),
    sourceType: text("source_type"),
    sourceId: text("source_id"),
    commercialRootType: text("commercial_root_type"),
    commercialRootId: text("commercial_root_id"),
    sourceIdentityKey: text("source_identity_key").notNull(),
    currency: text("currency").notNull(),
    sourceSnapshot: jsonb("source_snapshot")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    dimensions: jsonb("dimensions").$type<Record<string, string>>().notNull().default({}),
    note: text("note"),
    excluded: boolean("excluded").notNull().default(false),
    excludedBy: text("excluded_by"),
    excludedAt: timestamp("excluded_at", { withTimezone: true }),
    exclusionReason: text("exclusion_reason"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewReason: text("review_reason"),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    reason: text("reason").notNull(),
    createdBy: text("created_by").notNull(),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.forecastVersionId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.forecastVersionId],
      foreignColumns: [forecastVersions.organizationId, forecastVersions.id],
      name: "forecast_components_version_fk",
    }).onDelete("restrict"),
    uniqueIndex("forecast_component_commercial_root_date_unique")
      .on(
        table.organizationId,
        table.forecastVersionId,
        table.section,
        table.sourceIdentityKey,
        table.scheduledOn,
      )
      .where(sql`${table.sourceType} <> 'manual' and ${table.excluded} = false`),
    check("forecast_component_kind", sql`btrim(${table.kind}) <> ''`),
    check("forecast_component_amount", sql`${table.amountMinor} >= 0`),
    check("forecast_component_currency", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "forecast_component_probability",
      sql`${table.probabilityBps} between 0 and 10000 and (${table.kind} = 'weighted_pipeline' or ${table.probabilityBps} = 10000)`,
    ),
    check(
      "forecast_component_source",
      sql`${table.sourceType} is not null and btrim(${table.sourceType}) <> '' and ${table.sourceId} is not null and btrim(${table.sourceId}) <> '' and ${table.scheduledOn} is not null and ((${table.commercialRootType} is null and ${table.commercialRootId} is null) or (${table.commercialRootType} is not null and btrim(${table.commercialRootType}) <> '' and ${table.commercialRootId} is not null and btrim(${table.commercialRootId}) <> '')) and ((${table.kind} = 'manual_adjustment' and ${table.sourceType} = 'manual' and ${table.commercialRootType} is null) or (${table.kind} <> 'manual_adjustment' and ${table.sourceType} <> 'manual')) and (${table.section} <> 'revenue' or ${table.kind} = 'manual_adjustment' or ${table.commercialRootType} is not null)`,
    ),
    check("forecast_component_reason", sql`btrim(${table.reason}) <> ''`),
    check("forecast_component_version", sql`${table.version} > 0`),
    index("forecast_component_version_section_idx").on(
      table.organizationId,
      table.forecastVersionId,
      table.section,
      table.scheduledOn,
    ),
  ],
);

export const planningActualFacts = pgTable(
  "planning_actual_facts",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    actualBasis: planningActualBasis("actual_basis").notNull(),
    effectiveOn: date("effective_on").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourceParentId: text("source_parent_id"),
    sourceVersion: text("source_version").notNull(),
    dimensions: jsonb("dimensions").$type<Record<string, string>>().notNull().default({}),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true }).notNull().defaultNow(),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("planning_actual_fact_source_unique").on(
      table.organizationId,
      table.actualBasis,
      table.sourceType,
      table.sourceId,
    ),
    check("planning_actual_fact_id", sql`btrim(${table.id}) <> ''`),
    check("planning_actual_fact_currency", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "planning_actual_fact_source",
      sql`btrim(${table.sourceType}) <> '' and btrim(${table.sourceId}) <> '' and btrim(${table.sourceVersion}) <> '' and (${table.sourceParentId} is null or btrim(${table.sourceParentId}) <> '')`,
    ),
    index("planning_actual_fact_period_idx").on(
      table.organizationId,
      table.actualBasis,
      table.effectiveOn,
      table.currency,
    ),
  ],
);

export const planningAuditEvents = pgTable(
  "planning_audit_events",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    action: text("action").notNull(),
    actorId: text("actor_id").notNull(),
    reason: text("reason").notNull(),
    correlationId: text("correlation_id").notNull(),
    resourceVersion: bigint("resource_version", { mode: "bigint" }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    check("planning_audit_reason", sql`btrim(${table.reason}) <> ''`),
    index("planning_audit_resource_idx").on(
      table.organizationId,
      table.resourceType,
      table.resourceId,
    ),
  ],
);

export const postingRuleVersions = pgTable(
  "posting_rule_versions",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    ruleId: text("rule_id").notNull(),
    version: integer("version").notNull(),
    name: text("name").notNull(),
    documentType: text("document_type").notNull(),
    priority: integer("priority").notNull().default(100),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    status: postingRuleStatus("status").notNull().default("draft"),
    conditions: jsonb("conditions").$type<Record<string, unknown>>().notNull().default({}),
    lineTemplates: jsonb("line_templates").$type<readonly Record<string, unknown>[]>().notNull(),
    changeReason: text("change_reason").notNull(),
    correlationId: text("correlation_id").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.ruleId, table.version] }),
    unique("posting_rule_versions_effective_unique").on(
      table.organizationId,
      table.ruleId,
      table.effectiveFrom,
    ),
    check("posting_rule_version_positive", sql`${table.version} > 0`),
    check("posting_rule_priority_nonnegative", sql`${table.priority} >= 0`),
    check("posting_rule_name_not_blank", sql`btrim(${table.name}) <> ''`),
    check("posting_rule_document_type_not_blank", sql`btrim(${table.documentType}) <> ''`),
    check("posting_rule_change_reason_not_blank", sql`btrim(${table.changeReason}) <> ''`),
    check(
      "posting_rule_effective_date_order",
      sql`${table.effectiveTo} is null or ${table.effectiveTo} >= ${table.effectiveFrom}`,
    ),
    check("posting_rule_has_line_templates", sql`jsonb_array_length(${table.lineTemplates}) >= 2`),
  ],
);

export const schema = {
  organizations,
  users,
  organizationMemberships,
  membershipRoles,
  fiscalYears,
  fiscalPeriods,
  exchangeRates,
  accounts,
  accountHierarchyEdges,
  statutoryAccountMappings,
  taxCodeVersions,
  dimensionValues,
  dimensionRequirementVersions,
  defaultMappingVersions,
  parties,
  partyRoles,
  partyMergeLinks,
  partyBankAccounts,
  partyExternalReferences,
  projects,
  workforceProfiles,
  laborCostRates,
  timesheets,
  timesheetEntries,
  timesheetCostSnapshots,
  timesheetAdjustments,
  workforceCapacityVersions,
  projectCostItems,
  directCostAllocations,
  directCostAllocationSplits,
  contracts,
  milestones,
  scopeChanges,
  projectBudgetVersions,
  projectBudgetLines,
  revenueRecognitionPolicies,
  milestoneAcceptances,
  revenueRecognitionEvents,
  overheadAllocationPolicies,
  overheadSourcePools,
  overheadSourcePoolItems,
  overheadAllocationRuns,
  overheadAllocationSplits,
  resourceVersions,
  apiIdempotencyRecords,
  resourceAuditEvents,
  apiCredentials,
  journalEntries,
  accountingWorkflowPolicies,
  fiscalPeriodEvents,
  journalLines,
  journalPostingCommands,
  openingBalanceImports,
  commercialDocuments,
  commercialDocumentLines,
  commercialDocumentAllocations,
  commercialDocumentEvents,
  expenses,
  expenseLines,
  expenseAllocations,
  expenseEvents,
  evidenceRecords,
  evidenceVersions,
  evidenceAccessEvents,
  integrationSources,
  inboundMessages,
  inboundMessageAttempts,
  outboxEvents,
  outboundWebhookSubscriptions,
  outboundDeliveries,
  outboundDeliveryAttempts,
  financialAccounts,
  bankStatementImports,
  bankStatementSessions,
  bankStatementSessionImports,
  bankControlExceptions,
  bankTransactions,
  bankTransactionNormalizations,
  bankStatementImportRows,
  bankTransactionEvents,
  reconciliationCandidateRuns,
  paymentReconciliations,
  reconciliationCandidates,
  reconciliationAttempts,
  reconciliationAllocations,
  reconciliationAdjustments,
  reconciliationEvents,
  internalTransfers,
  internalTransferAttempts,
  internalTransferClaims,
  internalTransferCandidateRuns,
  internalTransferCandidates,
  internalTransferEvents,
  revenueTargetVersions,
  forecastVersions,
  planningAuditEvents,
  postingRuleVersions,
} as const;
