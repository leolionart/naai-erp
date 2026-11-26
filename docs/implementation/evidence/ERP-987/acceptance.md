# ERP-987 Acceptance Evidence

1. **Monthly close checklist (API + Web UI page)**:
   - Verified via `GET /api/v1/organizations/{organizationId}/fiscal-periods/{fiscalYear}/{periodNumber}/close-checklist` and `/accounting/period-close` (`period-close-checklist-section.tsx`).
   - Checks all 6 items: `unlinked_funding` (`funding-plans/unlinked` count = 0), `payment_evidence_gaps` (`ERP-982` resolved or noted via `POST .../close-checklist/notes`), `ap_tied` (`331` tie), `tax_finalization`, `bank_reconciled`, and `owner_custody_non_negative` (`111-OWNER-CUSTODY >= 0`).
   - Verified in `T-INT-CLOSE-001` that `POST /fiscal-periods/close` only warns (`closedWithWarnings: true`, `checklistWarnings`) and allows the owner to close when `reason` is supplied.

2. **Cash count (`kiểm quỹ`)**:
   - Verified via `POST /api/v1/organizations/{organizationId}/banking/cash-counts` and `/accounting/period-close?tab=cash-count` (`cash-count-section.tsx`).
   - Compares owner-entered physical cash against `111-OWNER-CUSTODY`, rejects negative physical counts (`CASH_COUNT_NEGATIVE_PHYSICAL_BALANCE`), posts shortage (`Dr 811-CASH-SHORT / Cr 111-OWNER-CUSTODY`) and overage (`Dr 111-OWNER-CUSTODY / Cr 711-CASH-OVER`) balanced journals with reason, handles exact matches without zero-value journals, and persists `owner_custody_cash_counts` idempotently.

3. **Negative custody fund alert**:
   - Verified on both `GET /reports/operating-dashboard` (`configurationWarnings` contains `owner_custody_negative`, `negativeOwnerCustodyAlert.suggestedTargetFunding === "owner_paid"`, rendered via `NegativeCustodyAlert` on Dashboard) and `GET .../close-checklist`.

4. **Year-end owner settlement**:
   - Verified via `GET /banking/owner-settlements/position` and `POST /banking/owner-settlements` plus `/accounting/period-close?tab=year-end-settlement` (`owner-settlement-section.tsx`).
   - Reports `3388`, `1388`, `111-OWNER-CUSTODY` (excluded from net owner position), and `421` retained earnings.
   - Executes audited, idempotent journals with mandatory reason for `offset_3388_1388` (`Dr 3388 / Cr 1388`), `profit_distribution` (`Dr 421 / Cr 1388`), and `repayment` (`company_to_owner` and `owner_to_company`), while rejecting `111-OWNER-CUSTODY` as a repayment source and rejecting amounts exceeding ledger balances.

5. **Contracts, CLI, Gate Matrix, Docs & 500-Line Rule**:
   - Updated `docs/api/openapi-v1.json`, `docs/implementation/solopreneur-gate-matrix.json`, `apps/cli/src/period-close-cli.ts`, `docs/product/business-rules.md` (`BR-CLOSE-001`), `docs/testing/test-specification.md`, `docs/testing/test-catalog.yaml`, and `docs/implementation/task-ledger.yaml`.
   - Every new source file is well below 500 lines.
