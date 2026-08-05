# ERP-240 Tests

- `pnpm --filter @naai-erp/domain test` — 58 tests passed, including exact GF-LEDGER-001 and reversal-history reconciliation.
- `pnpm --filter @naai-erp/api test` — 17 unit/contract tests passed locally; 11 PostgreSQL tests are defined and intentionally skipped without local PostgreSQL.
- `pnpm --filter @naai-erp/cli test` — 23 tests passed.
- `pnpm check` — format, lint, typecheck, documentation/security checks, tests and builds passed.
- `pnpm db:check` — migration directory valid with migration `0009_glorious_william_stryker.sql`.
- `git diff --check` — passed.

Local PostgreSQL was unavailable (`ECONNREFUSED localhost:5432`), so empty-database migration and ERP-240 API/PostgreSQL integration are pending exact-commit GitHub CI.
