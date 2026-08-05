# ERP-300 Tests

- `pnpm --filter @naai-erp/domain test` — 64 tests passed across 13 files.
- `pnpm --filter @naai-erp/api test` — 20 local unit/contract tests passed; 14 PostgreSQL tests are defined and skipped without local PostgreSQL.
- `pnpm --filter @naai-erp/cli test` — 33 tests passed.
- `pnpm check` — format, lint, typecheck, docs/security verification, all local tests and builds passed.
- `pnpm db:check` — 15 migration entries valid, including ERP-300 schema and immutability triggers.
- `git diff --check` — passed.

Exact-commit GitHub CI passed empty-database migration, database integration and all ERP-300 API/PostgreSQL scenarios for `9408d00a694ff5c1246e20732055debeb86e0220`:
https://github.com/leolionart/naai-erp/actions/runs/30992011125
