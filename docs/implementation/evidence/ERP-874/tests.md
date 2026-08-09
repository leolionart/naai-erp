# ERP-874 tests

- `pnpm --filter @naai-erp/web exec vitest run src/app/workspaces/dashboard-workspaces.test.ts` — 2 passed.
- `pnpm --filter @naai-erp/cli test` — 135 passed, 1 real-workbook test skipped without workbook environment paths.
- `pnpm --filter @naai-erp/api exec vitest run src/workbook-imports/workbook-import.integration.test.ts` — skipped in the coordinator shell without `DATABASE_URL`; the DB-enabled API run passed 39 files / 150 tests with the new valid and invalid service-line cases.
- `pnpm test` — 12 Turbo tasks passed.
- `pnpm check` — formatting, lint, typecheck, docs, security, fixtures, native DB, unit suites and builds passed.
- `git diff --check` — passed.
