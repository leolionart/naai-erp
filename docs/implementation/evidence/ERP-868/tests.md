# ERP-868 tests

- API suite: `pnpm --filter @naai-erp/api test` — PASS, 37 files / 143 tests; DB-gated suites skipped.
- Domain suite: `pnpm --filter @naai-erp/domain test` — PASS, 37 files / 187 tests.
- Focused web E2E: executive metrics + business mode — PASS, 7 tests.
- API, domain, web and database typechecks — PASS.
- Migration contract: `pnpm db:check` — PASS, 47 entries.
- `git diff --check` — PASS.

The existing fixed-ID DB integration fixture could not be rerun against the reused local database
because `org-erp640` already existed. A fresh test database could not be created by the restricted
local PostgreSQL role. The new authorization branch is therefore covered by a focused pure regression
test and the existing integration scenario remains in the suite for clean-database CI.
