import {
  bigint,
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
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { buildOwnerFundingTables } from "../owner-funding-schema.js";
import { sql } from "drizzle-orm";
import { organizations, parties } from "./part1.js";
import { projects } from "./part2.js";
import { journalEntries } from "./part3.js";
import { commercialDocuments } from "./part4.js";
import { expenses } from "./part5.js";
import { customerReceipts, financialAccounts } from "./part6.js";
import {
  auditColumns,
  bankImportRowOutcome,
  bankStatementSessionState,
  bankTransactionState,
} from "./shared.js";

export const customerReceiptAllocations = pgTable(
  "customer_receipt_allocations",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    receiptId: text("receipt_id").notNull(),
    salesInvoiceId: text("sales_invoice_id").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("customer_receipt_allocations_receipt_invoice_unique").on(
      table.organizationId,
      table.receiptId,
      table.salesInvoiceId,
    ),
    foreignKey({
      columns: [table.organizationId, table.receiptId],
      foreignColumns: [customerReceipts.organizationId, customerReceipts.id],
      name: "customer_receipt_allocations_receipt_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.salesInvoiceId],
      foreignColumns: [commercialDocuments.organizationId, commercialDocuments.id],
      name: "customer_receipt_allocations_invoice_fk",
    }).onDelete("restrict"),
    check("customer_receipt_allocations_amount_positive", sql`${table.amountMinor} > 0`),
  ],
);

export const projectFreelancePayables = pgTable(
  "project_freelance_payables",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    expenseId: text("expense_id").notNull(),
    projectId: text("project_id").notNull(),
    freelancerPartyId: text("freelancer_party_id").notNull(),
    dueDate: date("due_date").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    paidMinor: bigint("paid_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    currency: text("currency").notNull(),
    state: text("state").notNull().default("unpaid"),
    journalId: text("journal_id").notNull(),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("project_freelance_payables_expense_unique").on(table.organizationId, table.expenseId),
    foreignKey({
      columns: [table.organizationId, table.expenseId],
      foreignColumns: [expenses.organizationId, expenses.id],
      name: "project_freelance_payables_expense_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.projectId],
      foreignColumns: [projects.organizationId, projects.id],
      name: "project_freelance_payables_project_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.freelancerPartyId],
      foreignColumns: [parties.organizationId, parties.id],
      name: "project_freelance_payables_freelancer_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.journalId],
      foreignColumns: [journalEntries.organizationId, journalEntries.id],
      name: "project_freelance_payables_journal_fk",
    }).onDelete("restrict"),
    check(
      "project_freelance_payables_amounts",
      sql`${table.amountMinor} > 0 and ${table.paidMinor} >= 0 and ${table.paidMinor} <= ${table.amountMinor}`,
    ),
    check("project_freelance_payables_currency", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "project_freelance_payables_state",
      sql`${table.state} in ('unpaid','partially_paid','paid')`,
    ),
    check(
      "project_freelance_payables_state_amount",
      sql`(${table.state}='unpaid' and ${table.paidMinor}=0) or (${table.state}='partially_paid' and ${table.paidMinor}>0 and ${table.paidMinor}<${table.amountMinor}) or (${table.state}='paid' and ${table.paidMinor}=${table.amountMinor})`,
    ),
  ],
);

export const projectFreelancePayablePayments = pgTable(
  "project_freelance_payable_payments",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    payableId: text("payable_id").notNull(),
    financialAccountId: text("financial_account_id").notNull(),
    paymentDate: date("payment_date").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    journalId: text("journal_id").notNull(),
    createdBy: text("created_by").notNull(),
    correlationId: text("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.payableId],
      foreignColumns: [projectFreelancePayables.organizationId, projectFreelancePayables.id],
      name: "project_freelance_payable_payments_payable_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.financialAccountId],
      foreignColumns: [financialAccounts.organizationId, financialAccounts.id],
      name: "project_freelance_payable_payments_account_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.journalId],
      foreignColumns: [journalEntries.organizationId, journalEntries.id],
      name: "project_freelance_payable_payments_journal_fk",
    }).onDelete("restrict"),
    check("project_freelance_payable_payments_amount", sql`${table.amountMinor} > 0`),
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

export const { ownerCashWithdrawals, ownerFundingMovements } = buildOwnerFundingTables({
  organizations,
  financialAccounts,
  bankTransactions,
  journalEntries,
});

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
