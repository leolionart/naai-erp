import {
  bigint,
  check,
  date,
  foreignKey,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
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
  commercialDocumentState,
  commercialDocumentType,
  eligibilityState,
  managementValidityState,
} from "./shared.js";

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
    fundingFinancialAccountId: text("funding_financial_account_id"),
    ownerFundingMovementId: text("owner_funding_movement_id"),
    ...paymentEvidenceHeaderColumns,
    originalDocumentId: text("original_document_id"),
    reason: text("reason"),
    draftReasons: jsonb("draft_reasons")
      .$type<readonly Record<string, unknown>[]>()
      .notNull()
      .default([]),
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
    uniqueIndex("commercial_documents_number_active_unique")
      .on(table.organizationId, table.type, table.series, table.fiscalYear, table.documentNumber)
      .where(sql`${table.state} <> 'cancelled'`),
    uniqueIndex("commercial_documents_party_reference_active_unique")
      .on(table.organizationId, table.type, table.partyId, table.documentNumber)
      .where(sql`${table.state} <> 'cancelled'`),
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
    foreignKey({
      columns: [table.organizationId, table.fundingFinancialAccountId],
      foreignColumns: [financialAccounts.organizationId, financialAccounts.id],
      name: "commercial_documents_funding_account_fk",
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
    check(
      "commercial_documents_credit_reason",
      sql`(${table.type} = 'credit_note' and btrim(${table.reason}) <> '') or (${table.type} <> 'credit_note' and ${table.reason} is null)`,
    ),
    check("commercial_documents_version_positive", sql`${table.version} > 0`),
    check(
      "commercial_documents_purchase_funding",
      sql`${table.type} = 'purchase_invoice' or ${table.fundingFinancialAccountId} is null`,
    ),
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
    categoryCode: text("category_code"),
    taxAccountCode: text("tax_account_code"),
    taxCode: text("tax_code"),
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
    check(
      "commercial_document_lines_eligible_limits",
      sql`${table.citEligibleMinor} >= 0 and ${table.citEligibleMinor} <= ${table.grossMinor} and ${table.vatEligibleMinor} >= 0 and ${table.vatEligibleMinor} <= ${table.taxMinor}`,
    ),
    check(
      "commercial_document_lines_category_code_not_blank",
      sql`${table.categoryCode} is null or btrim(${table.categoryCode}) <> ''`,
    ),
    check(
      "commercial_document_lines_review_metadata",
      sql`(${table.reviewedBy} is null and ${table.reviewedAt} is null and ${table.reviewReason} is null and ${table.reviewReference} is null) or (${table.reviewedBy} is not null and ${table.reviewedAt} is not null and ${table.reviewReason} is not null and btrim(${table.reviewReason}) <> '')`,
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
