# ERP-867 tests

- `pnpm --filter @naai-erp/api test -- executive-metric.service.test.ts`
  - PASS: 36 files / 136 tests passed; 33 files / 103 tests skipped by the repository test setup.
- `pnpm --filter @naai-erp/api typecheck`
  - PASS.
- `pnpm --filter @naai-erp/web typecheck`
  - PASS.
- `PLAYWRIGHT_SKIP_WEBSERVER=1 pnpm --filter @naai-erp/web exec playwright test e2e/executive-metrics.spec.ts --project=desktop-chromium --project=mobile-chromium`
  - PASS: 6 tests.
- `git diff --check`
  - PASS.

One attempted Playwright command used the nonexistent project name `mobile-chrome`; it failed before
running tests and was immediately corrected to the configured `mobile-chromium` project above.
