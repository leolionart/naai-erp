import { boolean, date, pgEnum, text } from "drizzle-orm/pg-core";

export const paymentEvidenceHeaderColumns = {
  paymentMethod: text("payment_method").notNull().default("unpaid"),
  paidOn: date("paid_on"),
  paymentEvidenceRef: text("payment_evidence_ref"),
  transactionEvidence: text("transaction_evidence").notNull().default("none"),
  paymentEvidenceMissing: boolean("payment_evidence_missing").notNull().default(false),
} as const;

export const paymentEvidenceLineColumns = {
  paymentEvidenceMissing: boolean("payment_evidence_missing").notNull().default(false),
} as const;

export const reportSnapshotState = pgEnum("report_snapshot_state", ["captured"]);
export const reportSnapshotReadiness = pgEnum("report_snapshot_readiness", [
  "final",
  "review_required",
]);
export const accountantExportState = pgEnum("accountant_export_state", ["generated", "superseded"]);
export const accountantExportFormat = pgEnum("accountant_export_format", ["csv", "xlsx"]);
export const workbookImportReviewStatus = pgEnum("workbook_import_review_status", [
  "pending_review",
  "approved",
  "ignored",
  "posted",
]);
export const cashFlowClass = pgEnum("cash_flow_class", [
  "operating",
  "investing",
  "financing",
  "non_cash",
]);
export const executiveMetricPolicyState = pgEnum("executive_metric_policy_state", [
  "draft",
  "approved",
  "retired",
]);
export const executiveMetricSemanticKind = pgEnum("executive_metric_semantic_kind", [
  "contributed_capital",
  "retained_earnings",
  "unrestricted_cash",
  "restricted_cash",
  "reviewed_equity_adjustment",
  "other_equity",
  "owner_withdrawal",
  "owner_loan",
]);
