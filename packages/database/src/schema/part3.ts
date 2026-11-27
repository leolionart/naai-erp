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
import { fiscalPeriods, organizations } from "./part1.js";
import { milestones, projects } from "./part2.js";
import {
  auditColumns,
  fiscalPeriodState,
  journalState,
  milestoneAcceptanceState,
  recognitionEventState,
  recognitionPolicyMethod,
  recognitionPolicyState,
} from "./shared.js";

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

// Bounded operational telemetry. Unlike resourceAuditEvents, these rows are not part of the
// immutable financial audit chain and are deliberately eligible for time-based retention.
export const operationalActivityLogs = pgTable(
  "operational_activity_logs",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    service: text("service").notNull(),
    operation: text("operation").notNull(),
    status: text("status").notNull(),
    severity: text("severity").notNull().default("info"),
    workerId: text("worker_id"),
    correlationId: text("correlation_id"),
    summary: text("summary").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    index("operational_activity_logs_org_created_idx").on(table.organizationId, table.createdAt),
    index("operational_activity_logs_expiry_idx").on(table.expiresAt),
    check("operational_activity_logs_service_not_blank", sql`btrim(${table.service}) <> ''`),
    check("operational_activity_logs_operation_not_blank", sql`btrim(${table.operation}) <> ''`),
    check(
      "operational_activity_logs_status_valid",
      sql`${table.status} in ('running','succeeded','failed','skipped')`,
    ),
    check(
      "operational_activity_logs_severity_valid",
      sql`${table.severity} in ('info','warning','error')`,
    ),
  ],
);

export const apiCredentials = pgTable(
  "api_credentials",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    name: text("name"),
    actorId: text("actor_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    roles: jsonb("roles").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("active"),
    autoRecord: boolean("auto_record").notNull().default(false),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
    operatingMode: text("operating_mode").notNull().default("controlled"),
    allowSelfApproval: boolean("allow_self_approval").notNull().default(false),
    selfApprovalMaxMinor: bigint("self_approval_max_minor", { mode: "bigint" }),
    nonCashThresholdMinor: bigint("non_cash_threshold_minor", { mode: "bigint" })
      .notNull()
      .default(sql`5000000`),
    softLockPostingRoles: jsonb("soft_lock_posting_roles")
      .$type<string[]>()
      .notNull()
      .default(["owner", "finance_admin"]),
    updatedBy: text("updated_by").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "workflow_policy_operating_mode",
      sql`${table.operatingMode} in ('controlled', 'solopreneur')`,
    ),
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
