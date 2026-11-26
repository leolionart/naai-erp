# ERP-981 Tests

- `apps/api/src/funding-plans/funding-plans.integration.test.ts`: verified `GET /funding-plans/unlinked` returns unlinked records, totals, and rule-based suggestions on scratch Postgres DB (`RUN_DB_INTEGRATION=1`).
- Repo gates (`verify-docs.mjs`, `verify-solopreneur-gate-matrix.mjs`, `pnpm lint`, `pnpm typecheck`, `pnpm test`) verified.
