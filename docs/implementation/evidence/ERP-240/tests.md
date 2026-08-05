# ERP-240 Tests

- `pnpm --filter @naai-erp/domain test` — 58 tests passed, including exact GF-LEDGER-001 and reversal-history reconciliation.
- `pnpm --filter @naai-erp/api test` — 17 unit/contract tests passed locally; 11 PostgreSQL tests are defined and intentionally skipped without local PostgreSQL.
- `pnpm --filter @naai-erp/cli test` — 23 tests passed.
- `pnpm check` — format, lint, typecheck, documentation/security checks, tests and builds passed.
- `pnpm db:check` — migration directory valid with migration `0009_glorious_william_stryker.sql`.
- `git diff --check` — passed.

Exact-commit GitHub CI passed the empty-database migration, database integration and API/PostgreSQL suites for `0135312bc55167610bb7bcd39c9157ad20b2b91c`:
https://github.com/leolionart/naai-erp/actions/runs/30990167332
