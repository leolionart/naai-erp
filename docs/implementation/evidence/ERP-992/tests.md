# ERP-992 — Tests

## Commands and Results

1. Formatting & Docs Gate:
   - `pnpm exec prettier --write ...` — passed
   - `node scripts/verify-docs.mjs` — passed (`Verified 11 accepted ADRs, 12 rule references, and 29 AI relationship resources.`)

2. Lint & Typecheck Gates:
   - `pnpm lint` — passed (0 errors; 0 `max-lines` warnings on all touched/created files including `focused-records.fixtures.ts` and `focused-records.spec.ts`)
   - `pnpm typecheck` — passed across all workspace packages

3. Scratch PostgreSQL Integration Tests (executed twice back-to-back on the same `naai_erp_scratch_992` database to verify both assertions and repeat-run isolation/cleanup):
   - `DATABASE_URL="postgresql://naai_erp:naai_erp@127.0.0.1:5432/naai_erp_scratch_992" RUN_DB_INTEGRATION=1 pnpm --filter @naai-erp/api exec vitest run src/customer-service-subscriptions/customer-service-subscription.integration.test.ts src/portable-data-packages/empty-organization-restore.integration.test.ts src/portable-data-packages/local-organization-reset.integration.test.ts src/report-exports/management-workbook.integration.test.ts src/report-exports/accountant-exports.integration.test.ts src/report-exports/export-retention.integration.test.ts`
   - Run 1: 6 test files passed, 12 tests passed
   - Run 2 (same DB, no drop between runs): 6 test files passed, 12 tests passed

4. Playwright E2E Specs (mocked API env isolated from `.env.local`):
   - `pnpm --filter @naai-erp/web exec playwright test e2e/focused-records.spec.ts`
   - Result: 26 passed (25 `desktop-chromium` + 1 `mobile-chromium`, 0 failed)
