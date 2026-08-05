# ERP-140 test evidence

Node runtime: `v22.21.1`.

Commands: `pnpm check`, `pnpm db:check`.

Local results:

- API: 8 unit/contract tests passed; 2 PostgreSQL integration tests registered for CI.
- CLI: 3 tests passed, including API URL/headers, idempotency/version headers and no database dependency.
- Contracts: 2 envelope/mutation-metadata tests passed.
- OpenAPI registry coverage, opaque composite-key round trip and arbitrary resource rejection passed.
- Full repository checks/build passed across 10 packages.
- Migration directory validation passed with 7 entries.
- Exact PostgreSQL API integration awaits pushed-commit CI.
