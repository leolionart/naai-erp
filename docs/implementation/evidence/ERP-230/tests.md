# ERP-230 Tests

- `pnpm --filter @naai-erp/domain test` — 52 tests passed.
- API unit/contract suite — 13 tests passed locally; PostgreSQL integration queued for CI.
- CLI suite — 18 tests passed.
- `pnpm db:check` — migration directory valid.
- `git diff --check` — passed.

Exact-commit PostgreSQL CI is required before completion.
