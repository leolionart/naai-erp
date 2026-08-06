# ERP-610 risks and follow-up

- Forecast quality depends on canonical source identity. Imports must map contract, invoice, milestone and opportunity views to the same reviewed commercial root to prevent double-counting.
- Actual-to-date must use the forecast version's explicit basis and `Asia/Ho_Chi_Minh` cutoff. A basis or cutoff mismatch can produce a plausible but incorrect total.
- Published source snapshots preserve forecast reproducibility but may differ from later source records. Corrections require a new forecast version; history must not be rewritten.
- Late or backdated accounting entries intentionally do not rewrite a published composition snapshot. Reviewers need a new forecast version or a later variance report to explain the difference between the retained forecast view and subsequently completed actuals.
- Atomic publish depends on the PostgreSQL transaction covering validation, composition calculation, state transition and snapshot persistence. Exact-commit CI executed this integration path successfully.
- Payroll forecast is sensitive. API/UI authorization and source snapshots must avoid exposing compensation detail to roles that only need aggregate planning totals.
- AP due, tax and capex affect cash timing but are not automatically current-period OPEX. Future financial-statement work must retain that distinction.
- Owner loans and contributions are financing. Formal equity/liability treatment belongs to ledger policy and ERP-630/640, not an implicit revenue classification here.
- Fixture values are anonymized and must not be replaced with customer-identifying production data in Git.
- Local and exact-commit CI Playwright are green at 37/37. PostgreSQL integration and the complete GitHub quality job also passed for the proof commit.
