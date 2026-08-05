# ERP-240 Acceptance

- Trial Balance: implemented with exact opening/period/closing values and zero-difference control.
- General Ledger: implemented with inclusive date/account filters, opening-seeded running balance and journal/source drill-down.
- Opening balance import: implemented with dry-run, supplied/recomputed control totals, no hidden plug, active-account checks and AR/AP open-item detail.
- Approval/posting: implemented by linking the import to the existing audited maker/checker journal workflow and period controls.
- AI-native contract: versioned org-scoped REST/OpenAPI and first-party CLI cover reports plus opening-balance create/read/dry-run.
- Independent oracle: GF-LEDGER-001 proves 535,000,000 VND closing debit equals 535,000,000 VND closing credit and preserves reversed original history.

Final acceptance and Gate G2 remain pending exact-commit PostgreSQL CI.
