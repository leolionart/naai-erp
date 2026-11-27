import {
  accountantExportFormat,
  accountantExportState,
  cashFlowClass,
  executiveMetricPolicyState,
  executiveMetricSemanticKind,
  reportSnapshotReadiness,
  reportSnapshotState,
  workbookImportReviewStatus,
} from "../payment-evidence-columns.js";
import { customType, pgEnum, timestamp } from "drizzle-orm/pg-core";

export {
  accountantExportFormat,
  accountantExportState,
  cashFlowClass,
  executiveMetricPolicyState,
  executiveMetricSemanticKind,
  reportSnapshotReadiness,
  reportSnapshotState,
  workbookImportReviewStatus,
};

export const bytea = customType<{ data: Uint8Array }>({
  dataType() {
    return "bytea";
  },
});

export const auditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const role = pgEnum("role", [
  "owner",
  "finance_admin",
  "accountant",
  "project_manager",
  "approver",
  "viewer",
  "integration",
]);

export const fiscalPeriodState = pgEnum("fiscal_period_state", [
  "open",
  "soft_locked",
  "hard_locked",
]);

export const accountRootType = pgEnum("account_root_type", [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
]);

export const statutoryFramework = pgEnum("statutory_framework", ["TT133", "TT200"]);

export const financialStatementMappingState = pgEnum("financial_statement_mapping_state", [
  "draft",
  "approved",
  "retired",
]);

export const financialStatementKind = pgEnum("financial_statement_kind", [
  "profit_and_loss",
  "balance_sheet",
  "cash_flow",
  "vat_reconciliation",
]);

export const roiPurpose = pgEnum("roi_purpose", ["project", "marketing", "custom"]);

export const roiInputKind = pgEnum("roi_input_kind", ["benefit", "included_cost"]);

export const roiInputReviewState = pgEnum("roi_input_review_state", [
  "pending",
  "reviewed",
  "rejected",
]);

export const taxKind = pgEnum("tax_kind", [
  "vat_input",
  "vat_output",
  "cit",
  "withholding",
  "other",
]);

export const taxReviewState = pgEnum("tax_review_state", [
  "draft",
  "accountant_approved",
  "retired",
]);

export const dimensionKind = pgEnum("dimension_kind", [
  "cost_center",
  "service_line",
  "category",
  "client",
  "project",
  "contract",
]);

export const businessCategoryType = pgEnum("business_category_type", ["expense", "revenue"]);

export const partyRole = pgEnum("party_role", ["client", "supplier", "freelancer", "employee"]);

export const partyStatus = pgEnum("party_status", ["active", "inactive", "merged"]);

export const projectState = pgEnum("project_state", [
  "planned",
  "active",
  "on_hold",
  "completed",
  "closed",
]);

export const contractType = pgEnum("contract_type", [
  "fixed_fee",
  "time_and_materials",
  "retainer",
  "internal",
]);

export const customerSubscriptionLifecycle = pgEnum("customer_subscription_lifecycle", [
  "draft",
  "active",
  "paused",
  "cancelled",
  "expired",
]);

export const subscriptionRecurrenceFrequency = pgEnum("subscription_recurrence_frequency", [
  "month",
  "quarter",
  "year",
]);

export const journalState = pgEnum("journal_state", ["draft", "approved", "posted", "reversed"]);

export const postingRuleStatus = pgEnum("posting_rule_status", ["draft", "active", "retired"]);

export const targetPeriodKind = pgEnum("target_period_kind", ["month", "quarter", "year"]);

export const planningActualBasis = pgEnum("planning_actual_basis", [
  "recognized",
  "invoiced",
  "collected",
]);

export const planningVersionState = pgEnum("planning_version_state", [
  "draft",
  "published",
  "superseded",
]);

export const forecastScenario = pgEnum("forecast_scenario", ["base", "best", "worst", "custom"]);

export const forecastSnapshotKind = pgEnum("forecast_snapshot_kind", ["working", "month_end"]);

export const forecastComponentSection = pgEnum("forecast_component_section", [
  "revenue",
  "expense",
  "cash",
]);

export const forecastComponentDirection = pgEnum("forecast_component_direction", [
  "increase",
  "decrease",
]);

export const commercialDocumentType = pgEnum("commercial_document_type", [
  "sales_invoice",
  "purchase_invoice",
  "credit_note",
]);

export const commercialDocumentState = pgEnum("commercial_document_state", [
  "draft",
  "captured",
  "validated",
  "verified",
  "approved",
  "issued",
  "posted",
  "partially_paid",
  "paid",
  "cancelled",
]);

export const expenseClass = pgEnum("expense_class", [
  "invoice_backed",
  "receipt_backed",
  "contract_backed",
  "payroll_personnel",
  "bank_fee",
  "tax_payment",
  "non_documented",
  "owner_personal",
  "prepaid_asset",
  "fixed_asset",
  "employee_reimbursement",
  "freelancer",
  "platform_fee",
  "overseas_vendor",
  "petty_cash",
]);

export const expenseFundingTreatment = pgEnum("expense_funding_treatment", [
  "company_funds",
  "owner_paid_company_cost",
  "tax_only_non_cash",
]);

export const expenseState = pgEnum("expense_state", [
  "draft",
  "submitted",
  "evidence_pending",
  "approved",
  "rejected",
  "posted",
  "reversed",
]);

export const eligibilityState = pgEnum("eligibility_state", [
  "unreviewed",
  "eligible",
  "partially_eligible",
  "ineligible",
  "accountant_override",
]);

export const managementValidityState = pgEnum("management_validity_state", [
  "unreviewed",
  "valid",
  "invalid",
  "accountant_override",
]);

export const evidenceVersionStatus = pgEnum("evidence_version_status", [
  "active",
  "superseded",
  "quarantined",
]);

export const evidenceReviewState = pgEnum("evidence_review_state", [
  "pending",
  "accepted",
  "rejected",
  "needs_review",
]);

export const inboundMessageState = pgEnum("inbound_message_state", [
  "received",
  "processed",
  "quarantined",
  "retry_scheduled",
  "dead_letter",
]);

export const inboundAttemptOutcome = pgEnum("inbound_attempt_outcome", [
  "processed",
  "quarantined",
  "retryable_failure",
  "dead_letter",
]);

export const outboundSubscriptionStatus = pgEnum("outbound_subscription_status", [
  "active",
  "paused",
  "disabled",
]);

export const outboundDeliveryState = pgEnum("outbound_delivery_state", [
  "pending",
  "leased",
  "retry_scheduled",
  "delivered",
  "dead_letter",
]);

export const outboundAttemptOutcome = pgEnum("outbound_attempt_outcome", [
  "delivered",
  "retryable_failure",
  "permanent_failure",
  "lease_expired",
]);

export const financialAccountKind = pgEnum("financial_account_kind", ["bank", "cash"]);

export const financialAccountStatus = pgEnum("financial_account_status", ["active", "inactive"]);

export const bankTransactionState = pgEnum("bank_transaction_state", [
  "imported",
  "suggested",
  "matched",
  "reconciled",
  "ignored",
  "needs_review",
]);

export const bankImportRowOutcome = pgEnum("bank_import_row_outcome", [
  "imported",
  "duplicate",
  "rejected",
]);

export const bankStatementSessionState = pgEnum("bank_statement_session_state", [
  "draft",
  "reviewed",
  "closed",
]);

export const bankControlExceptionKind = pgEnum("bank_control_exception_kind", [
  "suspense",
  "control",
]);

export const bankControlExceptionStatus = pgEnum("bank_control_exception_status", [
  "pending",
  "approved",
  "resolved",
  "rejected",
]);

export const reconciliationAttemptState = pgEnum("reconciliation_attempt_state", [
  "matched",
  "reconciled",
  "unreconciled",
]);

export const reconciliationTargetType = pgEnum("reconciliation_target_type", [
  "commercial_document",
  "expense",
]);

export const reconciliationCandidateStatus = pgEnum("reconciliation_candidate_status", [
  "proposed",
  "accepted",
  "rejected",
]);

export const reconciliationAdjustmentKind = pgEnum("reconciliation_adjustment_kind", [
  "bank_fee",
  "fx_gain",
  "fx_loss",
  "suspense",
]);

export const journalSide = pgEnum("journal_side", ["debit", "credit"]);

export const internalTransferState = pgEnum("internal_transfer_state", [
  "pending_counterpart",
  "matched",
  "reconciled",
  "unmatched",
  "needs_review",
]);

export const internalTransferAttemptState = pgEnum("internal_transfer_attempt_state", [
  "pending_counterpart",
  "matched",
  "reconciled",
  "unmatched",
  "needs_review",
]);

export const projectBudgetState = pgEnum("project_budget_state", [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "superseded",
]);

export const projectBudgetKind = pgEnum("project_budget_kind", ["baseline", "revision"]);

export const projectBudgetCategory = pgEnum("project_budget_category", [
  "revenue",
  "labor",
  "freelancer",
  "vendor",
  "tool",
  "travel",
  "overhead",
]);

export const scopeChangeState = pgEnum("scope_change_state", [
  "draft",
  "submitted",
  "approved",
  "rejected",
]);

export const recognitionPolicyMethod = pgEnum("recognition_policy_method", [
  "milestone",
  "percentage_of_completion",
  "invoice",
]);

export const recognitionPolicyState = pgEnum("recognition_policy_state", [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "superseded",
]);

export const milestoneAcceptanceState = pgEnum("milestone_acceptance_state", [
  "draft",
  "submitted",
  "accepted",
  "rejected",
]);

export const recognitionEventState = pgEnum("recognition_event_state", [
  "draft",
  "submitted",
  "approved",
  "posted",
  "reversed",
  "rejected",
]);
