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
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { accounts, exchangeRates } from "./part1.js";
import { journalEntries } from "./part3.js";
import { commercialDocuments } from "./part4.js";
import { expenses } from "./part5.js";
import { bankStatementSessions, bankTransactions, reconciliationCandidateRuns } from "./part7.js";
import {
  auditColumns,
  bankControlExceptionKind,
  bankControlExceptionStatus,
  internalTransferState,
  journalSide,
  reconciliationAdjustmentKind,
  reconciliationAttemptState,
  reconciliationCandidateStatus,
  reconciliationTargetType,
} from "./shared.js";

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
