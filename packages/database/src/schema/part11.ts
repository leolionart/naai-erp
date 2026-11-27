import {
  accountantExportFormat,
  accountantExportState,
  reportSnapshotReadiness,
  reportSnapshotState,
  workbookImportReviewStatus,
} from "../payment-evidence-columns.js";
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
import { sql } from "drizzle-orm";
import { organizations } from "./part1.js";
import { commercialDocuments } from "./part4.js";
import { expenses } from "./part5.js";
import { auditColumns, bytea } from "./shared.js";

export const reportSnapshots = pgTable(
  "report_snapshots",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    version: integer("version").notNull(),
    previousSnapshotId: text("previous_snapshot_id"),
    previousSnapshotVersion: integer("previous_snapshot_version"),
    reportKind: text("report_kind").notNull(),
    state: reportSnapshotState("state").notNull().default("captured"),
    readiness: reportSnapshotReadiness("readiness").notNull(),
    periodStartsOn: date("period_starts_on").notNull(),
    periodEndsOn: date("period_ends_on").notNull(),
    dimensions: jsonb("dimensions").$type<Record<string, string>>().notNull().default({}),
    accountingBasis: text("accounting_basis").notNull(),
    framework: text("framework"),
    currency: text("currency").notNull(),
    canonicalRequest: jsonb("canonical_request").$type<Record<string, unknown>>().notNull(),
    requestHash: text("request_hash").notNull(),
    canonicalResult: jsonb("canonical_result").$type<Record<string, unknown>>().notNull(),
    resultHash: text("result_hash").notNull(),
    formulaVersions: jsonb("formula_versions").$type<Record<string, string>>().notNull(),
    mappingVersions: jsonb("mapping_versions").$type<Record<string, string>>().notNull(),
    ledgerCutoff: jsonb("ledger_cutoff").$type<Record<string, unknown>>().notNull(),
    sourceManifest: jsonb("source_manifest").$type<readonly Record<string, unknown>[]>().notNull(),
    sourceFingerprint: text("source_fingerprint").notNull(),
    readinessSummary: jsonb("readiness_summary").$type<Record<string, unknown>>().notNull(),
    unresolvedItems: jsonb("unresolved_items")
      .$type<readonly Record<string, unknown>[]>()
      .notNull()
      .default([]),
    capturedBy: text("captured_by").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id, table.version] }),
    foreignKey({
      columns: [table.organizationId, table.previousSnapshotId, table.previousSnapshotVersion],
      foreignColumns: [table.organizationId, table.id, table.version],
      name: "report_snapshots_previous_fk",
    }).onDelete("restrict"),
    unique("report_snapshot_reproduction_unique").on(
      table.organizationId,
      table.reportKind,
      table.requestHash,
      table.sourceFingerprint,
    ),
    index("report_snapshots_period_idx").on(
      table.organizationId,
      table.reportKind,
      table.periodStartsOn,
      table.periodEndsOn,
    ),
    check("report_snapshot_version_positive", sql`${table.version} > 0`),
    check(
      "report_snapshot_previous_pair",
      sql`(${table.previousSnapshotId} is null and ${table.previousSnapshotVersion} is null) or (${table.previousSnapshotId} is not null and ${table.previousSnapshotVersion} is not null and ${table.previousSnapshotVersion} > 0)`,
    ),
    check("report_snapshot_period_order", sql`${table.periodEndsOn} >= ${table.periodStartsOn}`),
    check("report_snapshot_kind_not_blank", sql`btrim(${table.reportKind}) <> ''`),
    check("report_snapshot_basis_not_blank", sql`btrim(${table.accountingBasis}) <> ''`),
    check("report_snapshot_currency", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check("report_snapshot_request_hash_not_blank", sql`btrim(${table.requestHash}) <> ''`),
    check("report_snapshot_result_hash_not_blank", sql`btrim(${table.resultHash}) <> ''`),
    check(
      "report_snapshot_source_fingerprint_not_blank",
      sql`btrim(${table.sourceFingerprint}) <> ''`,
    ),
    check("report_snapshot_dimensions_object", sql`jsonb_typeof(${table.dimensions}) = 'object'`),
    check(
      "report_snapshot_canonical_objects",
      sql`jsonb_typeof(${table.canonicalRequest}) = 'object' and jsonb_typeof(${table.canonicalResult}) = 'object'`,
    ),
    check(
      "report_snapshot_version_objects",
      sql`jsonb_typeof(${table.formulaVersions}) = 'object' and jsonb_typeof(${table.mappingVersions}) = 'object'`,
    ),
    check(
      "report_snapshot_ledger_cutoff_object",
      sql`jsonb_typeof(${table.ledgerCutoff}) = 'object'`,
    ),
    check(
      "report_snapshot_source_manifest_array",
      sql`jsonb_typeof(${table.sourceManifest}) = 'array'`,
    ),
    check(
      "report_snapshot_readiness_summary_object",
      sql`jsonb_typeof(${table.readinessSummary}) = 'object'`,
    ),
    check(
      "report_snapshot_unresolved_items_array",
      sql`jsonb_typeof(${table.unresolvedItems}) = 'array'`,
    ),
  ],
);

export const accountantExports = pgTable(
  "accountant_exports",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    version: integer("version").notNull(),
    previousExportId: text("previous_export_id"),
    previousExportVersion: integer("previous_export_version"),
    snapshotId: text("snapshot_id").notNull(),
    snapshotVersion: integer("snapshot_version").notNull(),
    format: accountantExportFormat("format").notNull(),
    state: accountantExportState("state").notNull().default("generated"),
    label: text("label").notNull(),
    manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull(),
    content: bytea("content"),
    contentHash: text("content_hash").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "bigint" }).notNull(),
    mediaType: text("media_type").notNull(),
    filename: text("filename").notNull(),
    generatedBy: text("generated_by").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    contentPrunedAt: timestamp("content_pruned_at", { withTimezone: true }),
    supersededBy: text("superseded_by"),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    supersedeReason: text("supersede_reason"),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id, table.version] }),
    foreignKey({
      columns: [table.organizationId, table.snapshotId, table.snapshotVersion],
      foreignColumns: [reportSnapshots.organizationId, reportSnapshots.id, reportSnapshots.version],
      name: "accountant_exports_snapshot_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.organizationId, table.previousExportId, table.previousExportVersion],
      foreignColumns: [table.organizationId, table.id, table.version],
      name: "accountant_exports_previous_fk",
    }).onDelete("restrict"),
    unique("accountant_export_content_unique").on(
      table.organizationId,
      table.snapshotId,
      table.snapshotVersion,
      table.format,
      table.contentHash,
    ),
    index("accountant_exports_snapshot_idx").on(
      table.organizationId,
      table.snapshotId,
      table.snapshotVersion,
    ),
    check("accountant_export_version_positive", sql`${table.version} > 0`),
    check("accountant_export_snapshot_version_positive", sql`${table.snapshotVersion} > 0`),
    check(
      "accountant_export_previous_pair",
      sql`(${table.previousExportId} is null and ${table.previousExportVersion} is null) or (${table.previousExportId} is not null and ${table.previousExportVersion} is not null and ${table.previousExportVersion} > 0)`,
    ),
    check("accountant_export_label_not_blank", sql`btrim(${table.label}) <> ''`),
    check("accountant_export_manifest_object", sql`jsonb_typeof(${table.manifest}) = 'object'`),
    check("accountant_export_content_hash_not_blank", sql`btrim(${table.contentHash}) <> ''`),
    check("accountant_export_size_nonnegative", sql`${table.sizeBytes} >= 0`),
    check("accountant_export_media_type_not_blank", sql`btrim(${table.mediaType}) <> ''`),
    check("accountant_export_filename_not_blank", sql`btrim(${table.filename}) <> ''`),
    check(
      "accountant_export_supersede_metadata",
      sql`(${table.state} = 'generated' and ${table.supersededBy} is null and ${table.supersededAt} is null and ${table.supersedeReason} is null) or (${table.state} = 'superseded' and ${table.supersededBy} is not null and ${table.supersededAt} is not null and btrim(coalesce(${table.supersedeReason}, '')) <> '')`,
    ),
  ],
);

export const portableDataImports = pgTable(
  "portable_data_imports",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    packageId: text("package_id").notNull(),
    state: text("state").notNull(),
    workbookSha256: text("workbook_sha256").notNull(),
    packageHash: text("package_hash").notNull(),
    inventory: jsonb("inventory").$type<Record<string, unknown>>().notNull(),
    parsedSheets: jsonb("parsed_sheets").$type<readonly Record<string, unknown>[]>().notNull(),
    dryRunId: text("dry_run_id"),
    dryRun: jsonb("dry_run").$type<Record<string, unknown>>(),
    commitResult: jsonb("commit_result").$type<Record<string, unknown>>(),
    inventoryIdempotencyKey: text("inventory_idempotency_key").notNull(),
    dryRunIdempotencyKey: text("dry_run_idempotency_key"),
    commitIdempotencyKey: text("commit_idempotency_key"),
    actorId: text("actor_id").notNull(),
    correlationId: text("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    foreignKey({
      columns: [table.organizationId, table.packageId],
      foreignColumns: [portableDataPackages.organizationId, portableDataPackages.id],
      name: "portable_data_imports_package_fk",
    }),
    unique("portable_data_imports_inventory_idempotency_unique").on(
      table.organizationId,
      table.inventoryIdempotencyKey,
    ),
    index("portable_data_imports_package_idx").on(table.organizationId, table.packageId),
  ],
);

export const externalReferences = pgTable(
  "external_references",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    system: text("system").notNull(),
    externalId: text("external_id").notNull(),
    documentId: text("document_id"),
    expenseId: text("expense_id"),
    canonicalUrl: text("canonical_url"),
    checksum: text("checksum"),
    version: text("version"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.system, table.externalId] }),
    foreignKey({
      columns: [table.organizationId, table.documentId],
      foreignColumns: [commercialDocuments.organizationId, commercialDocuments.id],
      name: "external_references_document_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.expenseId],
      foreignColumns: [expenses.organizationId, expenses.id],
      name: "external_references_expense_fk",
    }).onDelete("cascade"),
    check("external_references_system_not_blank", sql`btrim(${table.system}) <> ''`),
    check("external_references_external_id_not_blank", sql`btrim(${table.externalId}) <> ''`),
    check(
      "external_references_target_present",
      sql`(${table.documentId} is not null or ${table.expenseId} is not null)`,
    ),
    check(
      "external_references_target_exclusive",
      sql`not (${table.documentId} is not null and ${table.expenseId} is not null)`,
    ),
  ],
);

export const workbookImportReviewRows = pgTable(
  "workbook_import_review_rows",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    importIdentity: text("import_identity").notNull(),
    sourceIdentity: text("source_identity").notNull(),
    workbook: text("workbook").notNull(),
    sheet: text("sheet").notNull(),
    sourceRow: integer("source_row").notNull(),
    kind: text("kind").notNull(),
    proposedResourceType: text("proposed_resource_type").notNull(),
    proposedResourceId: text("proposed_resource_id"),
    status: workbookImportReviewStatus("status").notNull().default("pending_review"),
    reviewFlags: jsonb("review_flags").$type<readonly string[]>().notNull(),
    rawData: jsonb("raw_data").$type<Record<string, unknown>>().notNull(),
    mappedData: jsonb("mapped_data").$type<Record<string, unknown>>().notNull(),
    resolution: jsonb("resolution").$type<Record<string, unknown>>().notNull().default({}),
    notes: text("notes"),
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
    ...auditColumns,
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("workbook_import_review_rows_source_unique").on(
      table.organizationId,
      table.sourceIdentity,
    ),
    index("workbook_import_review_rows_import_idx").on(table.organizationId, table.importIdentity),
    index("workbook_import_review_rows_status_idx").on(table.organizationId, table.status),
  ],
);

export const portableDataPackages = pgTable(
  "portable_data_packages",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    asOf: date("as_of").notNull(),
    format: text("format").notNull(),
    manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull(),
    schemas: jsonb("schemas").$type<readonly Record<string, unknown>[]>().notNull(),
    content: bytea("content"),
    contentHash: text("content_hash").notNull(),
    packageHash: text("package_hash").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "bigint" }).notNull(),
    mediaType: text("media_type").notNull(),
    filename: text("filename").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    generatedBy: text("generated_by").notNull(),
    correlationId: text("correlation_id").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    contentPrunedAt: timestamp("content_pruned_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.id] }),
    unique("portable_data_packages_idempotency_unique").on(
      table.organizationId,
      table.idempotencyKey,
    ),
    index("portable_data_packages_generated_idx").on(table.organizationId, table.generatedAt),
    check("portable_data_packages_schema_version_positive", sql`${table.schemaVersion} > 0`),
    check("portable_data_packages_xlsx_only", sql`${table.format} = 'xlsx'`),
    check("portable_data_packages_content_hash_not_blank", sql`btrim(${table.contentHash}) <> ''`),
    check("portable_data_packages_package_hash_not_blank", sql`btrim(${table.packageHash}) <> ''`),
    check("portable_data_packages_size_nonnegative", sql`${table.sizeBytes} >= 0`),
  ],
);
