# ERP-240 Summary

Implemented the core ledger reporting and opening-balance import slice.

- Trial Balance derives from posted and reversed ledger history, separates opening, period and closing values, fails visibly through a non-zero difference, and links each account to General Ledger drill-down.
- General Ledger is deterministically ordered and carries opening, running and closing exact balances plus journal/reversal/source metadata.
- Opening-balance dry-run rejects unexplained variance, invalid/inactive accounts and missing AR/AP party/document detail.
- Accepted opening imports create one organization-scoped draft journal atomically with batch metadata, audit and idempotency; the normal maker/checker and period-controlled journal workflow approves/posts it.
- Opening imports are readable through REST and CLI, and database status follows linked journal approval/posting.
- GF-LEDGER-001 is a manually reviewed VND oracle with immutable hashes, cumulative movements of 709m/709m and closing-side Trial Balance of 535m/535m.

Start commit: `8556ef02d7fa52444c49a903fddbb596c47d5b4f`.
