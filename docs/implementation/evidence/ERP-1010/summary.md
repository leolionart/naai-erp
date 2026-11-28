# ERP-1010 — Summary

## Outcome

- Updated `evaluatePaymentDeductibility` and `resolveStatutoryNonCashThresholdMinor` in `@naai-erp/domain` to apply the statutory `20,000,000` VND non-cash payment threshold for purchase invoices and expenses dated before `2025-07-01` (prior to Law on VAT 48/2024/QH15 + Decree 181/2025/ND-CP) and `5,000,000` VND from `2025-07-01` onward when using the default statutory threshold, while continuing to honor any custom organization override.
- Forwarded `recordDate` across `payment-evidence-evaluator.ts`, `payment-evidence-gaps.query.ts`, `expense-tax-finalization.helper.ts`, and `draft-recording-checks.helper.ts`.
- Updated `commitTaxFinalizationOperation` (`expense-tax-finalization.operation.ts`) to clear stale `payment_evidence_missing` flags on finalized lines and synchronize parent headers (`expenses`, `commercial_documents`).

## Files Changed

- `packages/domain/src/payment-evidence.ts`
- `packages/domain/src/payment-evidence.test.ts`
- `apps/api/src/payment-evidence/payment-evidence-evaluator.ts`
- `apps/api/src/payment-evidence/payment-evidence-gaps.query.ts`
- `apps/api/src/expenses/expense-tax-finalization.helper.ts`
- `apps/api/src/expenses/expense-tax-finalization.operation.ts`
- `apps/api/src/draft-recording/draft-recording-checks.helper.ts`
- `docs/product/business-rules.md`
- `docs/testing/test-specification.md`
- `docs/testing/test-catalog.yaml`
- `docs/implementation/task-ledger.yaml`
