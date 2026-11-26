# ERP-971

- In `solopreneur` mode, `PgExpenseStore.transition` (`approve`) by an `owner` now calls `applySolopreneurTaxDefaults` to populate any still-`unreviewed` management, CIT, and VAT axes with the documented solopreneur defaults while preserving any explicit reviews or overrides, and passes `sourceDocumentCounts = true` to `assertReviewReady`.
- `controlled` mode continues to reject unreviewed expenses with `EXPENSE_REVIEW_INCOMPLETE`.
- Excluded `discarded` expenses from duplicate-document detection in `PgExpenseStore`, and updated the stale date fixture in `expense.integration.test.ts`.
