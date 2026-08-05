import { sql } from "drizzle-orm";
import {
  boolean,
  bigint,
  check,
  date,
  foreignKey,
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
  contracts,
  milestones,
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
  outboxEvents,
  postingRuleVersions,
} as const;
