# ERP-200 Tests

Local checks on Node.js 22.21.1:

- `pnpm check` — passed.
- `pnpm db:check` — passed; migration directory valid.
- `pnpm --filter @naai-erp/domain test` — 33 tests passed, including 1,000 deterministic property cases.
- API unit/contract tests — passed in repository suite.
- CLI tests — passed in repository suite.
- `git diff --check` — passed.

PostgreSQL integration could not run locally because no PostgreSQL service or Docker daemon was available on port 5432.

Exact-commit GitHub CI passed for `ccde1ce0f8e8e5530e8f7ba4785a046068ccf6ff`:

- PostgreSQL 16 empty-database migration passed.
- Database constraint and immutability integration tests passed.
- API-to-PostgreSQL authentication, balanced/unbalanced posting, idempotency, concurrency and transactional outbox tests passed.
- Run: https://github.com/leolionart/naai-erp/actions/runs/30987090756
