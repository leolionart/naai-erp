# ERP-978 Tests

- `apps/api/src/funding-plans/funding-plans.integration.test.ts`: verified export CSV, dry-run with ready + blocked rows and dashboard impact, stale `planHash` 409 rejection, and commit on scratch Postgres DB (`RUN_DB_INTEGRATION=1`).
- `apps/cli/src/client.test.ts`: verified `funding-plans` export/dry-run/commit routing.
- Repo gates (`verify-docs.mjs`, `verify-solopreneur-gate-matrix.mjs`, `pnpm lint`, `pnpm typecheck`, `pnpm test`) verified.
