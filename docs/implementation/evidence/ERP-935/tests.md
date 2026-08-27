# ERP-935 tests

- `pnpm --filter @naai-erp/web exec vitest run src/lib/records/category.test.ts src/app/workspaces/focused-expense-presentation.test.ts` — passed, 2 files, 7 tests.
- `pnpm --filter @naai-erp/web exec tsc --noEmit` — passed.
- `pnpm --filter @naai-erp/api exec tsc --noEmit` — passed after SQL projection change.
- `PLAYWRIGHT_SKIP_WEBSERVER=1 pnpm --filter @naai-erp/web exec playwright test e2e/focused-records.spec.ts --grep "invoice list preserves the detail category" --project=desktop-chromium` — passed before the allocation-only expansion; the new allocation-only unit regression passed. The existing local server must be restarted to load the API SQL change before repeating the browser smoke check.
