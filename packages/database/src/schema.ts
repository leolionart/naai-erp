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
} as const;
