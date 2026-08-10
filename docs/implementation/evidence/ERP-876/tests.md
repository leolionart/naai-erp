# ERP-876 tests

- `pnpm --filter @naai-erp/contracts test` — 33 files, 77 tests passed.
- `pnpm --filter @naai-erp/api exec vitest run src/banking/banking.service.test.ts` — 6 passed.
- Fresh temporary PostgreSQL migrations plus `src/banking/banking.integration.test.ts` — 6 passed; temporary database removed.
- `pnpm --filter @naai-erp/web test` — 20 files, 55 tests passed.
- `pnpm --filter @naai-erp/web exec playwright test e2e/owner-current.spec.ts --project=desktop-chromium` — 1 passed.
- Contracts/API/web typechecks — passed.
- `git diff --check` — passed.
