# ERP-310 Tests

- `pnpm check` — format, lint, typecheck, documentation/security verification, all local tests and builds passed.
- Domain suite — 69 tests passed across 14 files, including expense lifecycle, independent review axes, tax treatment and allocation properties.
- API suite — 23 local tests passed; 16 PostgreSQL integration tests are defined and skipped locally when PostgreSQL is unavailable, including 2 ERP-310 end-to-end cases.
- CLI suite — 46 tests passed, including expense routes and caller-supplied idempotency keys.
- `pnpm db:check` — 16 migration entries valid, including ERP-310 schema and posted-expense immutability triggers.
- `jq empty docs/api/openapi-v1.json` and `git diff --check` — passed.

Authoritative empty-database migration and PostgreSQL integration proof is required from exact-commit GitHub CI before ERP-310 is marked done.
