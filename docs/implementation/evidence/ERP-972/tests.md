# ERP-972 Tests

- Added regression test in `apps/api/src/commercial-documents/commercial-document.integration.test.ts` verifying that voiding a document whose journal was already reversed directly transitions the document to `cancelled` and keeps exactly 1 reversal journal.
- Executed `commercial-document.integration.test.ts` and `expense.integration.test.ts` against a scratch Postgres database (`RUN_DB_INTEGRATION=1`), plus `verify-docs.mjs`, `verify-solopreneur-gate-matrix.mjs`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
