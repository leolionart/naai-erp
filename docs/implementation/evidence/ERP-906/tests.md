# ERP-906 tests

- `pnpm db:check` — passed; migration directory valid with 55 entries.
- Database suite — 17 passed, 20 integration-dependent skipped.
- API portable/retention scoped suites — 27 passed with expected integration skips.
- PostgreSQL retention integration on fresh `naai_erp_erp906_test` — 1 passed.
- Fresh database migration through 0052 — passed.
- Upgrade migration on `naai_erp_demo` — passed.
- `pnpm exec vitest run tests/database-maintenance.test.ts tests/production-update.test.ts` — 4/4 passed.
- `pnpm test:release` — release, Compose and production-update contracts passed.
- `pnpm test:docs`, security baseline, golden fixtures and native database tests — passed.
- Repository lint and typecheck — 10/10 packages passed.
- Repository tests — 12/12 package tasks passed; API 161 passed with database suites skipped in the
  non-integration run.
- Production builds — 10/10 package tasks passed, including the Next.js production build.
- `pnpm format:check` and `git diff --check` — passed.
