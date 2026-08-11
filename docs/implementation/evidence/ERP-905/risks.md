# ERP-905 risks and follow-ups

- Migration 0051 is destructive for the explicitly retired subsystem tables. Operators must retain a
  normal database backup before upgrade even though canonical accounting tables are not mutated.
- Operators upgrading an older installation should still take the normal database backup because the
  retired subsystem data is intentionally deleted. The populated upgrade run confirmed that canonical
  Expense, commercial-document, journal, customer-receipt and freelance-payable tables remain present.
- Historical ERP-901 evidence remains historical only; its routine-completion runtime and current API
  contract were removed because every supported resource was retired by ERP-905.
- The long-running local API process used by `demo:verify` was started before this migration and needs
  a restart to read the migrated demo database consistently; repository gates and the isolated
  PostgreSQL integration are unaffected.
