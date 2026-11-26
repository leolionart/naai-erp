# ERP-979 Tests

- `apps/api/src/funding-plans/account-plans.integration.test.ts`: verified expense and sales-invoice account reclassification via `account-plans/dry-run` (including invalid root-type blocking) and `account-plans/commit` on scratch Postgres DB (`RUN_DB_INTEGRATION=1`).
- Repo gates (`verify-docs.mjs`, `verify-solopreneur-gate-matrix.mjs`, `pnpm lint`, `pnpm typecheck`, `pnpm test`) verified.
