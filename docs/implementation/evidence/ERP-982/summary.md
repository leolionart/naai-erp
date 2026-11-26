# ERP-982 Summary

## Outcome

Implemented payment-evidence tracking, organization-configurable non-cash deductibility threshold (`non_cash_threshold_minor`, default `5000000` VND), solopreneur CIT/VAT deductibility gating, automatic re-evaluation on payment updates and bank reconciliation, and the `GET /reports/tax/payment-evidence-gaps` report across database, domain, contracts, REST API, CLI, Web UI, OpenAPI, and solopreneur gate matrix.

## Key Deliverables & Decisions

1. **Schema & Migration (`0075_payment_evidence_and_non_cash_threshold.sql`)**:
   - Added `non_cash_threshold_minor bigint not null default 5000000` to `accounting_workflow_policies`.
   - Added `payment_method` (`cash | bank_transfer | card | other | unpaid`, default `unpaid`), `paid_on`, `payment_evidence_ref`, `transaction_evidence` (`contract | purchase_order | email | acceptance | quote | none`, default `none`), and `payment_evidence_missing` to `expenses` and `commercial_documents`, plus `payment_evidence_missing` on `expense_lines` and `commercial_document_lines`.
   - Updated final-record immutability triggers to permit audited `app.payment_evidence_update = 'on'` and `app.tax_finalization = 'on'` updates while keeping posted `journal_entries`, `journal_lines`, and source amounts immutable.
2. **Domain & Solopreneur Evaluation (`packages/domain/src/payment-evidence.ts`, `apps/api/src/payment-evidence/`)**:
   - Purchases `< non_cash_threshold_minor` or settled via qualifying non-cash (`bank_transfer` or `card`, requiring `payment_evidence_ref` when `owner_paid`, or reconciled bank payment) default to `eligible` in solopreneur mode.
   - Purchases `>= non_cash_threshold_minor` with `cash`, `other`, `unpaid`, or `owner_paid` without `payment_evidence_ref` are never blocked from posting; instead, CIT/VAT remain `unreviewed` with deductible amount `0` and `payment_evidence_missing = true`.
   - Same-day purchase invoices and documented expenses from the same supplier are aggregated for the VAT threshold check, and sibling lines on that date are re-evaluated automatically.
   - Reconciling/unreconciling outgoing bank payments infers/reverts `bank_transfer` + `paid_on` + reference and re-evaluates solopreneur eligibility.
   - Standard `/review` (`eligible | partially_eligible`) on `payment_evidence_missing` lines is rejected with `PAYMENT_EVIDENCE_REQUIRED` (`422`), and batch `tax-finalization` skips gated lines; only `accountant_override` with mandatory `reference` + `reason` can force eligibility.
3. **API, CLI & UI Surfaces**:
   - Added `GET /api/v1/organizations/{organizationId}/reports/tax/payment-evidence-gaps`, `PATCH /expenses/{id}/payment-evidence`, `PATCH /commercial-documents/{documentId}/payment-evidence`, and `PATCH /organization-workflow-policy`.
   - Surfaced `paymentEvidenceGaps` and `PAYMENT_EVIDENCE_MISSING` in VAT reconciliation, tax expense exceptions, and operating dashboard (`configurationWarnings` + `paymentEvidenceGaps`), plus `PaymentEvidenceGapsCard` in Web tax and dashboard workspaces and CLI commands (`reports payment-evidence-gaps`, `expenses update-payment-evidence`, `documents update-payment-evidence`, `workflow-policy get|update`).
   - Preserved modular file-size discipline: every new code file is `<= 500` lines and every modified `>500`-line file was refactored via helper extraction so its line count stayed at or below baseline.
