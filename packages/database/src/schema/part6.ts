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
import { accounts, organizations, parties } from "./part1.js";
import { journalEntries } from "./part3.js";
import {
  auditColumns,
  financialAccountKind,
  financialAccountStatus,
  inboundAttemptOutcome,
  inboundMessageState,
  outboundAttemptOutcome,
  outboundDeliveryState,
  outboundSubscriptionStatus,
} from "./shared.js";

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
    autoRecord: boolean("auto_record").notNull().default(false),
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

export const telegramSettings = pgTable(
  "telegram_settings",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organizations.id),
    enabled: boolean("enabled").notNull().default(false),
    enabledAt: timestamp("enabled_at", { withTimezone: true }),
    chatId: text("chat_id"),
    threadId: bigint("thread_id", { mode: "number" }),
    botTokenEncrypted: text("bot_token_encrypted"),
    botTokenHint: text("bot_token_hint"),
    notifyRevenue: boolean("notify_revenue").notNull().default(true),
    notifyExpense: boolean("notify_expense").notNull().default(true),
    notifyDrafts: boolean("notify_drafts").notNull().default(true),
    version: bigint("version", { mode: "number" }).notNull().default(1),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("telegram_settings_version_positive", sql`${table.version} > 0`),
    check(
      "telegram_settings_enabled_complete",
      sql`NOT ${table.enabled} OR (${table.chatId} IS NOT NULL AND ${table.botTokenEncrypted} IS NOT NULL)`,
    ),
  ],
);

export const telegramNotifications = pgTable(
  "telegram_notifications",
  {
    organizationId: text("organization_id").notNull(),
    outboxEventId: text("outbox_event_id").notNull(),
    state: text("state").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "telegram_notifications_pk",
      columns: [table.organizationId, table.outboxEventId],
    }),
    foreignKey({
      name: "telegram_notifications_event_fk",
      columns: [table.organizationId, table.outboxEventId],
      foreignColumns: [outboxEvents.organizationId, outboxEvents.id],
    }),
    check(
      "telegram_notifications_state_valid",
      sql`${table.state} in ('pending','sent','skipped','failed')`,
    ),
    check("telegram_notifications_attempts_nonnegative", sql`${table.attempts} >= 0`),
    index("telegram_notifications_due_idx").on(table.state, table.nextAttemptAt),
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

export const customerReceipts = pgTable(
  "customer_receipts",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    financialAccountId: text("financial_account_id").notNull(),
    receiptDate: date("receipt_date").notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    description: text("description").notNull(),
    state: text("state").notNull().default("posted"),
    journalId: text("journal_id").notNull(),
    customerId: text("customer_id").notNull(),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    createdBy: text("created_by").notNull(),
    correlationId: text("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.financialAccountId],
      foreignColumns: [financialAccounts.organizationId, financialAccounts.id],
      name: "customer_receipts_financial_account_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.journalId],
      foreignColumns: [journalEntries.organizationId, journalEntries.id],
      name: "customer_receipts_journal_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.customerId],
      foreignColumns: [parties.organizationId, parties.id],
      name: "customer_receipts_customer_fk",
    }).onDelete("restrict"),
    check("customer_receipts_amount_positive", sql`${table.amountMinor} > 0`),
    check("customer_receipts_currency_iso3", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("customer_receipts_description_not_blank", sql`btrim(${table.description}) <> ''`),
    check("customer_receipts_posted_state", sql`${table.state} = 'posted'`),
    check("customer_receipts_version_positive", sql`${table.version} > 0`),
  ],
);
