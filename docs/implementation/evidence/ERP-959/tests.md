# Tests

- `pnpm --filter @naai-erp/api exec vitest run src/report-exports/management-workbook.test.ts src/operating-dashboard/operating-dashboard.service.test.ts` — 2 files, 6 tests passed.
- `pnpm typecheck` — passed for all 10 packages.
- `pnpm exec prettier --check apps/api/src/report-exports/management-workbook.ts apps/api/src/report-exports/management-workbook.test.ts` — passed.
- `RUN_DB_INTEGRATION=1 pnpm --filter @naai-erp/api exec vitest run src/operating-dashboard/operating-dashboard.integration.test.ts` — not executed because no test `DATABASE_URL` is configured in this workspace; the regression fixture now asserts canonical shared-ledger counting and the reconciliation warning.
