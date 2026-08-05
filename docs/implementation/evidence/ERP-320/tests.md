# ERP-320 Tests

- `pnpm check` — formatting, lint, typecheck, documentation/security checks, local tests and builds passed.
- Domain suite — 72 tests passed across 15 files, including signature validation, sequential versions and review rules.
- API suite — 25 local tests passed; 18 PostgreSQL integration tests are defined and skipped locally without the CI database, including 2 ERP-320 scenarios.
- CLI suite — 54 tests passed, including evidence review/download routing and stable idempotency keys.
- `pnpm db:check` — 17 migration entries valid, including evidence metadata, access audit and immutability triggers.
- `jq empty docs/api/openapi-v1.json` and `git diff --check` — passed.

Exact-commit PostgreSQL CI remains required before marking ERP-320 done.
