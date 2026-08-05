# ERP-220 Tests

- `pnpm --filter @naai-erp/domain test` — 46 tests passed.
- API unit/contract suite — passed locally; PostgreSQL workflow cases queued for CI.
- CLI suite — 13 tests passed.
- `pnpm db:check` — migration directory valid.
- `git diff --check` — passed.

Exact-commit PostgreSQL CI is required before completion.
