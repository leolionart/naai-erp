# ERP-989 Risks, Mitigations & Follow-Ups

## Remaining Risks & Mitigations

1. **Concurrent draft edits between batch `dryRun` and `commit`**:
   - _Mitigation_: `planHash` incorporates each evaluated item's `initialVersion`, eligibility, target state, `grossMinor`, and blocker codes. Any concurrent edit, state change, or period lock between `dryRun` and `commit` alters the computed hash and fails safely with `409 DRAFT_RECORD_PLAN_MISMATCH` before committing.

2. **Non-cash payment evidence (`>= 5,000,000` VND) during one-click recording**:
   - _Mitigation_: Consistent with `ERP-982` (`BR-PAY-003`, `BR-FUND-009`), routine one-click recording posts management-valid expenses/invoices while withholding CIT/VAT deductibility (`unreviewed`, `paymentEvidenceMissing: true`) and surfacing `payment_evidence_missing` in `warnings`; callers that require strict tax-deductible readiness before posting can pass `requirePaymentEvidence: true` to block with `PAYMENT_EVIDENCE_REQUIRED`.

3. **Batch size bounds**:
   - _Mitigation_: `POST /drafts/record` caps batch evaluation to `200` drafts per call (`BATCH_RECORD_MAX_ITEMS`) so transaction lock duration and savepoint count stay bounded.

## Database Migrations

- No new SQL schema migration was required for `ERP-989`.
- Repaired a malformed duplicate JSON fragment in `db/migrations/meta/_journal.json` left during Wave 1 branch integration so empty-database `drizzle-kit migrate` runs cleanly across all 78 migrations.

## Follow-Ups

- `ERP-990` (`BR-REC-002`): reuse `recordExpenseOnClient` and `recordCommercialDocumentOnClient` for `autoRecord`-enabled integration sources so valid inbound payloads record immediately under the integration identity while invalid items persist as drafts with visible `reasons`.
