# ERP-931 tests

- `pnpm --filter @naai-erp/web test -- business-directory-workspace.test.ts business-directory-filters.test.ts`: passed, 28 files / 94 tests.
- `pnpm --filter @naai-erp/web typecheck`: passed.
- `pnpm --filter @naai-erp/api typecheck`: passed.
- `RUN_DB_INTEGRATION=1 DATABASE_URL=postgresql://naai_erp:naai_erp@127.0.0.1:5432/naai_erp pnpm --filter @naai-erp/api exec vitest run src/operating-dashboard/operating-dashboard.integration.test.ts`: passed, 2/2 tests. Regression proves a 550 gross receipt on a 1,000 net + 100 VAT invoice becomes 500 collected project revenue.
- `pnpm test:docs`: passed (11 ADRs, 12 rule references, 29 relationship resources).
- `pnpm --filter @naai-erp/web exec playwright test e2e/business-directory.spec.ts --grep "directory cards expose" --project=desktop-chromium --project=mobile-chromium`: passed, 2/2 responsive E2E cases.
- Targeted ESLint for all ERP-931 API/web/test files: passed.
- `pnpm lint`: passed after removing the unused legacy `idList` helper reported by the gate.
- In-app Browser was unavailable; the repository Playwright workflow provided rendered desktop and
  mobile verification instead.
