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
import {
  paymentEvidenceHeaderColumns,
  paymentEvidenceLineColumns,
} from "../payment-evidence-columns.js";
import { sql } from "drizzle-orm";
import { accounts, organizations, parties } from "./part1.js";
import { journalEntries } from "./part3.js";
import { financialAccounts } from "./part6.js";
import {
  auditColumns,
  businessCategoryType,
  eligibilityState,
  evidenceReviewState,
  evidenceVersionStatus,
  expenseClass,
  expenseFundingTreatment,
  expenseState,
  managementValidityState,
} from "./shared.js";

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
    freelanceDueDate: date("freelance_due_date"),
    servicePeriodStart: date("service_period_start"),
    servicePeriodEnd: date("service_period_end"),
    businessPurpose: text("business_purpose").notNull(),
    currency: text("currency").notNull(),
    netMinor: bigint("net_minor", { mode: "bigint" }).notNull(),
    vatMinor: bigint("vat_minor", { mode: "bigint" }).notNull(),
    grossMinor: bigint("gross_minor", { mode: "bigint" }).notNull(),
    counterAccountCode: text("counter_account_code").notNull(),
    /** Financial account that funded the expense when payment provenance is known. */
    fundingFinancialAccountId: text("funding_financial_account_id"),
    ownerFundingMovementId: text("owner_funding_movement_id"),
    ...paymentEvidenceHeaderColumns,
    citState: eligibilityState("cit_state").notNull().default("unreviewed"),
    vatState: eligibilityState("vat_state").notNull().default("unreviewed"),
    evidenceChecklist: jsonb("evidence_checklist")
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    draftReasons: jsonb("draft_reasons")
      .$type<readonly Record<string, unknown>[]>()
      .notNull()
      .default([]),
    journalId: text("journal_id"),
    /** Original posted expense superseded by this correction replacement. */
    originalExpenseId: text("original_expense_id"),
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
      columns: [table.organizationId, table.fundingFinancialAccountId],
      foreignColumns: [financialAccounts.organizationId, financialAccounts.id],
      name: "expenses_funding_account_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.journalId],
      foreignColumns: [journalEntries.organizationId, journalEntries.id],
      name: "expenses_journal_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.originalExpenseId],
      foreignColumns: [table.organizationId, table.id],
      name: "expenses_original_expense_fk",
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
    check(
      "expenses_freelance_due_date",
      sql`(${table.expenseClass} = 'freelancer' and ${table.freelanceDueDate} is not null and ${table.payeePartyId} is not null and ${table.freelanceDueDate} >= ${table.expenseDate}) or (${table.expenseClass} <> 'freelancer' and ${table.freelanceDueDate} is null)`,
    ),
  ],
);

export const expenseCategories = pgTable(
  "expense_categories",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    fundingTreatment: expenseFundingTreatment("funding_treatment").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.code] }),
    check("expense_categories_code_not_blank", sql`btrim(${table.code}) <> ''`),
    check("expense_categories_name_not_blank", sql`btrim(${table.name}) <> ''`),
    check("expense_categories_version_positive", sql`${table.version} > 0`),
  ],
);

/** Unified organization-scoped catalog used by revenue and expense entry flows. */
export const businessCategories = pgTable(
  "business_categories",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    kind: businessCategoryType("kind").notNull(),
    accountCode: text("account_code"),
    taxCode: text("tax_code"),
    isActive: boolean("is_active").notNull().default(true),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    createdBy: text("created_by").notNull().default("master-data"),
    updatedBy: text("updated_by").notNull().default("master-data"),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.kind, table.code] }),
    check("business_categories_code_not_blank", sql`btrim(${table.code}) <> ''`),
    check("business_categories_name_not_blank", sql`btrim(${table.name}) <> ''`),
    check("business_categories_version_positive", sql`${table.version} > 0`),
  ],
);

export const purchaseProducts = pgTable(
  "purchase_products",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    vatRatePercent: integer("vat_rate_percent").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    createdBy: text("created_by").notNull().default("master-data"),
    updatedBy: text("updated_by").notNull().default("master-data"),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.code] }),
    check("purchase_products_code_not_blank", sql`btrim(${table.code}) <> ''`),
    check("purchase_products_name_not_blank", sql`btrim(${table.name}) <> ''`),
    check("purchase_products_vat_rate", sql`${table.vatRatePercent} in (8, 10)`),
    check("purchase_products_version_positive", sql`${table.version} > 0`),
    index("purchase_products_active_name_idx").on(table.organizationId, table.isActive, table.name),
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
    expenseCategoryCode: text("expense_category_code"),
    fundingTreatment: expenseFundingTreatment("funding_treatment"),
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
    ...paymentEvidenceLineColumns,
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
      columns: [table.organizationId, table.expenseCategoryCode],
      foreignColumns: [expenseCategories.organizationId, expenseCategories.code],
      name: "expense_lines_category_fk",
    }).onDelete("restrict"),
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
      "expense_lines_category_snapshot",
      sql`(${table.expenseCategoryCode} is null and ${table.fundingTreatment} is null) or (${table.expenseCategoryCode} is not null and ${table.fundingTreatment} is not null)`,
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
