# ERP-210 Tests

- `pnpm --filter @naai-erp/domain test` — 39 tests passed.
- `pnpm --filter @naai-erp/api typecheck` — passed.
- API contract/unit suite — passed locally; PostgreSQL cases queued for CI.
- CLI suite — 9 tests passed.
- `pnpm db:check` — migration directory valid.

Exact-commit GitHub CI passed for `9b980c545bbd0c17d3dafeb48d13e81ee33215da`:

- PostgreSQL 16 migration and database integration passed.
- Organization-scoped posting-rule persistence/constraints passed.
- API-to-PostgreSQL rule evaluation with exact string amounts passed.
- Full repository check/build passed.
- Run: https://github.com/leolionart/naai-erp/actions/runs/30987647113
