# ERP-888 acceptance

- [x] UI captures date, active source account, formatted VND amount and note.
- [x] UI does not accept ledger account codes or arbitrary journal lines.
- [x] API is organization-scoped, authorized and idempotent.
- [x] API atomically creates negative cash evidence and a balanced posted Owner Current journal.
- [x] Fiscal period locks and approved Owner Current mapping are enforced.
- [x] Confirmed Owner Current read model classifies the canonical withdrawal without heuristics.
- [x] REST/OpenAPI and first-party CLI expose the same versioned command.
