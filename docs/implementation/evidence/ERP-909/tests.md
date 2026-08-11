# ERP-909 tests

- `pnpm --filter @naai-erp/web test -- automation-api-dialog.test.ts`: pass, 25 files and 77 tests.
- `pnpm --filter @naai-erp/web typecheck`: pass.
- `PLAYWRIGHT_SKIP_WEBSERVER=1 pnpm --filter @naai-erp/web exec playwright test e2e/automation-api-dialog.spec.ts --project=desktop-chromium --project=mobile-chromium`: pass, 7 tests.
- `pnpm test:docs`: pass, 11 ADRs, 12 rule references and 28 relationship resources verified.
- `pnpm check`: pass after formatting the task ledger; format, lint, typecheck, documentation,
  security baseline, fixtures, native database, repository tests and production build all passed.

The first expanded E2E run failed because its selector targeted a sidebar collapsible outside the
modal. The regression was corrected by scoping the locator to the automation dialog; the complete
rerun passed.
