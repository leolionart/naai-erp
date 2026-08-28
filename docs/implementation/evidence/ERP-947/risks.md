# Risks and follow-ups

- Existing production rows are intentionally not deleted. They remain available to audit users and
  ledger history; only default operational/read-model paths change.
- Journal-derived statements continue to include posted and reversed journal rows so reversal
  netting remains correct.
- A deploy/readback is still required before the production UI reflects this behavior.
- Expense lineage migration uses audited reverse-replace events for idempotent backfill; records
  without that audit event remain unlinked and are not guessed.
- The owner-current mapping must remain approved, effective for the document date, and resolve to
  exactly one active account; otherwise posting fails with `OWNER_CURRENT_ACCOUNT_NOT_CONFIGURED`.
- Historical duplicate rows are not hard-deleted; they require correction/reversal or explicit
  lifecycle filtering to preserve immutable journal history.
