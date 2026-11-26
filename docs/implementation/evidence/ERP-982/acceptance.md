# ERP-982 Acceptance

- **`BR-PAY-001` (Payment evidence fields & bank reconciliation inference)**:
  - `expenses` and `commercial_documents` persist `payment_method` (`cash | bank_transfer | card | other | unpaid`, default `unpaid`), `paid_on`, `payment_evidence_ref`, and `transaction_evidence` (`contract | purchase_order | email | acceptance | quote | none`, default `none`) across create, draft update, quick purchase invoice ingestion, funding reclassification, and audited `PATCH .../{id}/payment-evidence`.
  - Bank-reconciled outgoing payments automatically infer `bank_transfer` + `paid_on` + reference (`T-INT-PAY-002`).
- **`BR-PAY-002` & `BR-FUND-009` (Configurable non-cash threshold, same-day supplier VAT aggregation, re-evaluation, warning-only reporting)**:
  - Organization-configurable `non_cash_threshold_minor` (default `5000000` VND) stored on `accounting_workflow_policies` and exposed via `GET`/`PATCH /organization-workflow-policy`.
  - Solopreneur owner approval/posting marks `< threshold` or qualifying non-cash (`bank_transfer | card`, requiring `payment_evidence_ref` when `owner_paid`) as `eligible`, while `>= threshold` with `cash | other | unpaid` (or `owner_paid` without `payment_evidence_ref`) posts without blocking, keeps deductible amount `0` (`unreviewed`), and flags `payment_evidence_missing = true` (`T-INT-PAY-001`, `T-UNIT-PAY-003`).
  - Same-day same-supplier purchase invoices/expenses aggregate for VAT threshold checks and re-evaluate sibling lines (`T-INT-PAY-001`).
  - Updating payment evidence (`PATCH .../{id}/payment-evidence`) or reconciling bank payments (`POST .../reconcile` / `unreconcile`) re-evaluates CIT/VAT eligibility automatically (`T-INT-PAY-001`, `T-INT-PAY-002`).
  - `GET /reports/tax/payment-evidence-gaps` (plus CLI `reports payment-evidence-gaps`), VAT reconciliation, tax expense exceptions, and operating dashboard surface warning-only payment-evidence gaps and withheld CIT/VAT totals (`T-INT-PAY-001`).
- **`BR-PAY-003` (No shortcut to force `eligible` without `accountant_override` + `reference`)**:
  - Standard `/review` with `state: "eligible" | "partially_eligible"` on `payment_evidence_missing` lines is rejected with `422 PAYMENT_EVIDENCE_REQUIRED`; batch `tax-finalization` skips gated lines; `accountant_override` without `reference` is rejected with `422 ACCOUNTANT_OVERRIDE_REFERENCE_REQUIRED`; only `accountant_override` with `reference` + `reason` succeeds (`T-INT-PAY-001`).
