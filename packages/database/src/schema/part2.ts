import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizationMemberships, organizations, parties } from "./part1.js";
import {
  auditColumns,
  contractType,
  customerSubscriptionLifecycle,
  projectBudgetCategory,
  projectBudgetKind,
  projectBudgetState,
  projectState,
  scopeChangeState,
  subscriptionRecurrenceFrequency,
} from "./shared.js";

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
    defaultServiceLineCode: text("default_service_line_code"),
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

export const servicePlans = pgTable(
  "service_plans",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    serviceLineCode: text("service_line_code").notNull(),
    defaultUnitPriceMinor: bigint("default_unit_price_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    recurrenceFrequency: subscriptionRecurrenceFrequency("recurrence_frequency").notNull(),
    recurrenceInterval: integer("recurrence_interval").notNull(),
    billingDay: integer("billing_day").notNull(),
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
    unique("service_plans_org_code_unique").on(table.organizationId, table.code),
    check("service_plans_code_not_blank", sql`btrim(${table.code}) <> ''`),
    check("service_plans_name_not_blank", sql`btrim(${table.name}) <> ''`),
    check("service_plans_price_nonnegative", sql`${table.defaultUnitPriceMinor} >= 0`),
    check("service_plans_currency_iso3", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("service_plans_recurrence_interval", sql`${table.recurrenceInterval} between 1 and 120`),
    check("service_plans_billing_day", sql`${table.billingDay} between 1 and 31`),
    check("service_plans_version_positive", sql`${table.version} > 0`),
    index("service_plans_active_name_idx").on(table.organizationId, table.active, table.name),
  ],
);

export const customerServiceSubscriptions = pgTable(
  "customer_service_subscriptions",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    customerPartyId: text("customer_party_id").notNull(),
    servicePlanId: text("service_plan_id").notNull(),
    projectId: text("project_id"),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    quantity: bigint("quantity", { mode: "bigint" }).notNull(),
    unitPriceMinor: bigint("unit_price_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    recurrenceFrequency: subscriptionRecurrenceFrequency("recurrence_frequency").notNull(),
    recurrenceInterval: integer("recurrence_interval").notNull(),
    billingDay: integer("billing_day").notNull(),
    lifecycle: customerSubscriptionLifecycle("lifecycle").notNull().default("draft"),
    lifecycleEffectiveOn: date("lifecycle_effective_on"),
    lifecycleReason: text("lifecycle_reason"),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.customerPartyId],
      foreignColumns: [parties.organizationId, parties.id],
      name: "customer_subscriptions_customer_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.servicePlanId],
      foreignColumns: [servicePlans.organizationId, servicePlans.id],
      name: "customer_subscriptions_plan_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "customer_subscriptions_project_fk",
    }).onDelete("restrict"),
    check("customer_subscriptions_quantity_positive", sql`${table.quantity} > 0`),
    check("customer_subscriptions_price_nonnegative", sql`${table.unitPriceMinor} >= 0`),
    check("customer_subscriptions_currency_iso3", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "customer_subscriptions_date_order",
      sql`${table.endsOn} is null or ${table.endsOn} >= ${table.startsOn}`,
    ),
    check(
      "customer_subscriptions_recurrence_interval",
      sql`${table.recurrenceInterval} between 1 and 120`,
    ),
    check("customer_subscriptions_billing_day", sql`${table.billingDay} between 1 and 31`),
    check("customer_subscriptions_version_positive", sql`${table.version} > 0`),
    index("customer_subscriptions_filters_idx").on(
      table.organizationId,
      table.lifecycle,
      table.customerPartyId,
      table.servicePlanId,
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
