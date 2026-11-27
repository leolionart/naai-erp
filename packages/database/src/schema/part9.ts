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
import { organizations } from "./part1.js";
import { journalEntries } from "./part3.js";
import { bankTransactions } from "./part7.js";
import { internalTransfers } from "./part8.js";
import {
  auditColumns,
  forecastComponentDirection,
  forecastComponentSection,
  forecastScenario,
  forecastSnapshotKind,
  internalTransferAttemptState,
  planningActualBasis,
  planningVersionState,
  targetPeriodKind,
} from "./shared.js";

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
