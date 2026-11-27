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
} from "drizzle-orm/pg-core";
import {
  cashFlowClass,
  executiveMetricPolicyState,
  executiveMetricSemanticKind,
} from "../payment-evidence-columns.js";
import { sql } from "drizzle-orm";
import { accounts, organizations } from "./part1.js";
import {
  auditColumns,
  financialStatementKind,
  financialStatementMappingState,
  postingRuleStatus,
  roiInputKind,
  roiInputReviewState,
  roiPurpose,
  statutoryFramework,
} from "./shared.js";

export const planningAuditEvents = pgTable(
  "planning_audit_events",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    action: text("action").notNull(),
    actorId: text("actor_id").notNull(),
    reason: text("reason").notNull(),
    correlationId: text("correlation_id").notNull(),
    resourceVersion: bigint("resource_version", { mode: "bigint" }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    check("planning_audit_reason", sql`btrim(${table.reason}) <> ''`),
    index("planning_audit_resource_idx").on(
      table.organizationId,
      table.resourceType,
      table.resourceId,
    ),
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

export const financialStatementMappingVersions = pgTable(
  "financial_statement_mapping_versions",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    version: integer("version").notNull(),
    framework: statutoryFramework("framework").notNull(),
    state: financialStatementMappingState("state").notNull().default("draft"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    changeReason: text("change_reason").notNull(),
    reportPolicy: jsonb("report_policy")
      .$type<{
        maxLedgerDifferenceMinor: string;
        maxUnreviewedInputMinor: string;
        maxUnresolvedItemCount: number;
        maxMissingEvidenceCount: number;
      }>()
      .notNull()
      .default({
        maxLedgerDifferenceMinor: "0",
        maxUnreviewedInputMinor: "0",
        maxUnresolvedItemCount: 0,
        maxMissingEvidenceCount: 0,
      }),
    createdBy: text("created_by").notNull(),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id, table.version] }),
    check("financial_statement_mapping_version_positive", sql`${table.version} > 0`),
    check("financial_statement_mapping_reason_not_blank", sql`btrim(${table.changeReason}) <> ''`),
    check(
      "financial_statement_mapping_date_order",
      sql`${table.effectiveTo} is null or ${table.effectiveTo} >= ${table.effectiveFrom}`,
    ),
    check(
      "financial_statement_mapping_approval_metadata",
      sql`(${table.state} = 'draft' and ${table.approvedBy} is null and ${table.approvedAt} is null) or (${table.state} in ('approved','retired') and ${table.approvedBy} is not null and ${table.approvedAt} is not null)`,
    ),
  ],
);

export const financialStatementMappingLines = pgTable(
  "financial_statement_mapping_lines",
  {
    organizationId: text("organization_id").notNull(),
    mappingId: text("mapping_id").notNull(),
    mappingVersion: integer("mapping_version").notNull(),
    lineNumber: integer("line_number").notNull(),
    statement: financialStatementKind("statement").notNull(),
    lineCode: text("line_code").notNull(),
    label: text("label").notNull(),
    accountCode: text("account_code").notNull(),
    displayOrder: integer("display_order").notNull(),
    sign: integer("sign").notNull().default(1),
    cashFlowClass: cashFlowClass("cash_flow_class"),
    vatTreatment: text("vat_treatment"),
    ...auditColumns,
  },
  (table) => [
    primaryKey({
      columns: [table.organizationId, table.mappingId, table.mappingVersion, table.lineNumber],
    }),
    foreignKey({
      columns: [table.organizationId, table.mappingId, table.mappingVersion],
      foreignColumns: [
        financialStatementMappingVersions.organizationId,
        financialStatementMappingVersions.id,
        financialStatementMappingVersions.version,
      ],
      name: "financial_statement_mapping_lines_version_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.accountCode],
      foreignColumns: [accounts.organizationId, accounts.code],
      name: "financial_statement_mapping_lines_account_fk",
    }).onDelete("restrict"),
    unique("financial_statement_mapping_account_unique").on(
      table.organizationId,
      table.mappingId,
      table.mappingVersion,
      table.statement,
      table.accountCode,
    ),
    check("financial_statement_mapping_line_number_positive", sql`${table.lineNumber} > 0`),
    check("financial_statement_mapping_display_order_nonnegative", sql`${table.displayOrder} >= 0`),
    check("financial_statement_mapping_sign", sql`${table.sign} in (-1, 1)`),
    check("financial_statement_mapping_line_code_not_blank", sql`btrim(${table.lineCode}) <> ''`),
    check("financial_statement_mapping_label_not_blank", sql`btrim(${table.label}) <> ''`),
    check(
      "financial_statement_mapping_cash_flow_class",
      sql`${table.statement} = 'cash_flow' or ${table.cashFlowClass} is null`,
    ),
    check(
      "financial_statement_mapping_vat_treatment",
      sql`${table.vatTreatment} is null or ${table.vatTreatment} in ('output','input_eligible','input_ineligible')`,
    ),
  ],
);

export const executiveMetricPolicyVersions = pgTable(
  "executive_metric_policy_versions",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    version: integer("version").notNull(),
    state: executiveMetricPolicyState("state").notNull().default("draft"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    formulaVersion: text("formula_version").notNull(),
    formulaPolicy: jsonb("formula_policy")
      .$type<{
        averageBurnMonths: number;
        equityConsumedDenominator: "contributed_capital";
        runwayCashSemantic: "unrestricted_cash";
        runwayFlowClass: "operating";
        signedRevenueDenominator: boolean;
      }>()
      .notNull(),
    changeReason: text("change_reason").notNull(),
    createdBy: text("created_by").notNull(),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id, table.version] }),
    unique("executive_metric_policy_effective_unique").on(
      table.organizationId,
      table.id,
      table.effectiveFrom,
    ),
    check("executive_metric_policy_version_positive", sql`${table.version} > 0`),
    check(
      "executive_metric_policy_formula_version_not_blank",
      sql`btrim(${table.formulaVersion}) <> ''`,
    ),
    check("executive_metric_policy_reason_not_blank", sql`btrim(${table.changeReason}) <> ''`),
    check(
      "executive_metric_policy_date_order",
      sql`${table.effectiveTo} is null or ${table.effectiveTo} >= ${table.effectiveFrom}`,
    ),
    check(
      "executive_metric_policy_approval_metadata",
      sql`(${table.state} = 'draft' and ${table.approvedBy} is null and ${table.approvedAt} is null) or (${table.state} in ('approved','retired') and ${table.approvedBy} is not null and ${table.approvedAt} is not null)`,
    ),
    check(
      "executive_metric_policy_average_burn_months_positive",
      sql`coalesce((${table.formulaPolicy}->>'averageBurnMonths') ~ '^[1-9][0-9]*$', false)`,
    ),
  ],
);

export const executiveMetricSemanticMappings = pgTable(
  "executive_metric_semantic_mappings",
  {
    organizationId: text("organization_id").notNull(),
    policyId: text("policy_id").notNull(),
    policyVersion: integer("policy_version").notNull(),
    semantic: executiveMetricSemanticKind("semantic").notNull(),
    accountCode: text("account_code").notNull(),
    sign: integer("sign").notNull().default(1),
    notes: text("notes"),
    ...auditColumns,
  },
  (table) => [
    primaryKey({
      columns: [
        table.organizationId,
        table.policyId,
        table.policyVersion,
        table.semantic,
        table.accountCode,
      ],
    }),
    foreignKey({
      columns: [table.organizationId, table.policyId, table.policyVersion],
      foreignColumns: [
        executiveMetricPolicyVersions.organizationId,
        executiveMetricPolicyVersions.id,
        executiveMetricPolicyVersions.version,
      ],
      name: "executive_metric_semantic_mappings_policy_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.accountCode],
      foreignColumns: [accounts.organizationId, accounts.code],
      name: "executive_metric_semantic_mappings_account_fk",
    }).onDelete("restrict"),
    unique("executive_metric_semantic_mapping_account_unique").on(
      table.organizationId,
      table.policyId,
      table.policyVersion,
      table.accountCode,
    ),
    check("executive_metric_semantic_mapping_sign", sql`${table.sign} in (-1, 1)`),
  ],
);

export const roiDefinitionVersions = pgTable(
  "roi_definition_versions",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    version: integer("version").notNull(),
    purpose: roiPurpose("purpose").notNull(),
    name: text("name").notNull(),
    state: executiveMetricPolicyState("state").notNull().default("draft"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    formulaVersion: text("formula_version").notNull(),
    includedCostPolicy: jsonb("included_cost_policy")
      .$type<{ includedKinds: readonly string[]; excludedKinds: readonly string[] }>()
      .notNull(),
    changeReason: text("change_reason").notNull(),
    createdBy: text("created_by").notNull(),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id, table.version] }),
    unique("roi_definition_effective_unique").on(
      table.organizationId,
      table.id,
      table.effectiveFrom,
    ),
    check("roi_definition_version_positive", sql`${table.version} > 0`),
    check("roi_definition_name_not_blank", sql`btrim(${table.name}) <> ''`),
    check("roi_definition_formula_version_not_blank", sql`btrim(${table.formulaVersion}) <> ''`),
    check("roi_definition_reason_not_blank", sql`btrim(${table.changeReason}) <> ''`),
    check(
      "roi_definition_date_order",
      sql`${table.effectiveTo} is null or ${table.effectiveTo} >= ${table.effectiveFrom}`,
    ),
    check(
      "roi_definition_approval_metadata",
      sql`(${table.state} = 'draft' and ${table.approvedBy} is null and ${table.approvedAt} is null) or (${table.state} in ('approved','retired') and ${table.approvedBy} is not null and ${table.approvedAt} is not null)`,
    ),
    check(
      "roi_definition_included_cost_policy_objects",
      sql`coalesce(jsonb_typeof(${table.includedCostPolicy}) = 'object' and jsonb_typeof(${table.includedCostPolicy}->'includedKinds') = 'array' and jsonb_typeof(${table.includedCostPolicy}->'excludedKinds') = 'array', false)`,
    ),
  ],
);

export const roiInputFacts = pgTable(
  "roi_input_facts",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    definitionId: text("definition_id").notNull(),
    definitionVersion: integer("definition_version").notNull(),
    kind: roiInputKind("kind").notNull(),
    periodStartsOn: date("period_starts_on").notNull(),
    periodEndsOn: date("period_ends_on").notNull(),
    dimensions: jsonb("dimensions").$type<Record<string, string>>().notNull().default({}),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    reviewState: roiInputReviewState("review_state").notNull().default("pending"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewReason: text("review_reason"),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.definitionId, table.definitionVersion],
      foreignColumns: [
        roiDefinitionVersions.organizationId,
        roiDefinitionVersions.id,
        roiDefinitionVersions.version,
      ],
      name: "roi_input_facts_definition_fk",
    }).onDelete("restrict"),
    unique("roi_input_fact_source_unique").on(
      table.organizationId,
      table.definitionId,
      table.definitionVersion,
      table.sourceType,
      table.sourceId,
      table.kind,
    ),
    index("roi_input_facts_period_idx").on(
      table.organizationId,
      table.definitionId,
      table.periodStartsOn,
      table.periodEndsOn,
    ),
    check("roi_input_fact_period_order", sql`${table.periodEndsOn} >= ${table.periodStartsOn}`),
    check("roi_input_fact_amount_nonnegative", sql`${table.amountMinor} >= 0`),
    check("roi_input_fact_dimensions_object", sql`jsonb_typeof(${table.dimensions}) = 'object'`),
    check("roi_input_fact_currency_not_blank", sql`btrim(${table.currency}) <> ''`),
    check("roi_input_fact_source_type_not_blank", sql`btrim(${table.sourceType}) <> ''`),
    check("roi_input_fact_source_id_not_blank", sql`btrim(${table.sourceId}) <> ''`),
    check(
      "roi_input_fact_review_metadata",
      sql`(${table.reviewState} = 'pending' and ${table.reviewedBy} is null and ${table.reviewedAt} is null) or (${table.reviewState} in ('reviewed','rejected') and ${table.reviewedBy} is not null and ${table.reviewedAt} is not null and btrim(coalesce(${table.reviewReason}, '')) <> '')`,
    ),
  ],
);
