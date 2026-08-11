# ERP-908 tests

- `pnpm --filter @naai-erp/web test -- src/app/auth/automation-token/route.test.ts src/components/automation-api-dialog.test.ts` — passed, 25 files and 71 tests.
- `pnpm --filter @naai-erp/web typecheck` — passed.
- `PLAYWRIGHT_SKIP_WEBSERVER=1 pnpm --filter @naai-erp/web exec playwright test e2e/automation-api-dialog.spec.ts --project=desktop-chromium --project=mobile-chromium` — passed, 2 of 2.
- Browser QA at `http://localhost:3000/expenses` — desktop and 390x844 mobile passed; token reveal and complete purchase-invoice cURL verified; mobile document width 390 equals viewport width 390; no console errors.
- `pnpm check` — passed: format, lint, typecheck, docs, security baseline, fixtures, native DB tests, repository tests and production build.
- `git diff --check` — passed.
