# ERP-873 risks

- Expense metadata is descriptive drill-down evidence and must not alter ledger-derived balances.
- Historical journals without `expenses.journal_id` or `commercial_documents.journal_id` remain explicitly unlinked; the implementation intentionally does not guess from date, amount, or free text.
- Localhost currently reads an older deployed upstream API image, so the new source fields require the next API release before appearing in that live table.
