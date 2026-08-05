# ERP-210 Tests

- `pnpm --filter @naai-erp/domain test` — 39 tests passed.
- `pnpm --filter @naai-erp/api typecheck` — passed.
- API contract/unit suite — passed locally; PostgreSQL cases queued for CI.
- CLI suite — 9 tests passed.
- `pnpm db:check` — migration directory valid.

Exact-commit PostgreSQL CI is required before completion.
