# ERP-882 tests

- API unit/controller suite: 41 files passed, 159 tests passed; unrelated DB suites skipped by their
  normal environment gates.
- `RUN_DB_INTEGRATION=1 DATABASE_URL=postgresql://...@127.0.0.1:55432/naai_erp pnpm --filter
  @naai-erp/api exec vitest run src/expense-reports/expense-report.integration.test.ts` — 1 file,
  2 tests passed against a migrated temporary PostgreSQL 16 database.
- Contracts: 35 files, 83 tests passed; contracts typecheck passed.
- CLI focused suites: 4 files, 138 tests passed and 1 unrelated test skipped; CLI typecheck passed.
- Web Vitest: 22 files, 60 tests passed; web typecheck passed.
- `pnpm --filter @naai-erp/web exec playwright test e2e/expense-breakdown-reports.spec.ts
  --project=desktop-chromium --project=mobile-chrome` — 2/2 passed; mobile had no document overflow.
- `pnpm test:docs`, `pnpm format:check`, `git diff --check` — passed.
- Browser readback verified both routes/navigation render on localhost. The native dev web currently
  proxies production, whose API does not yet include ERP-882 until the commit is pushed and released.
