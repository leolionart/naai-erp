# ERP-986 Tests

- `pnpm --filter @naai-erp/domain exec vitest run src/cit-rate.test.ts` (`T-UNIT-TAX-102`): 6/6 passed — verifies `0`, `2,999,999,999`, `3,000,000,000` (15%), `3,000,000,001`, `50,000,000,000` (17%), `50,000,000,001` (20%), year with no prior-year revenue, `priorYearRevenueOverrideMinor`, `citSmallEnterpriseIneligible` override (20%), custom year schedules, pre-2025 fallback, and negative taxable profit flooring.
- `pnpm --filter @naai-erp/api exec vitest run src/cit-policy/cit-policy.service.test.ts src/operating-dashboard/operating-dashboard.service.test.ts src/operating-dashboard/operating-dashboard.store.test.ts`: 8/8 passed.
- `pnpm --filter @naai-erp/cli exec vitest run src/cit-client.test.ts src/client.test.ts`: 100/100 passed.
- `pnpm --filter @naai-erp/web exec vitest run src/app/workspaces/dashboard-workspaces.test.ts`: 6/6 passed.
- Scratch PostgreSQL migration (`0000..0074`) + `RUN_DB_INTEGRATION=1 pnpm --filter @naai-erp/api exec vitest run src/cit-policy/cit-policy.integration.test.ts src/operating-dashboard/operating-dashboard.integration.test.ts src/financial-statements/financial-statement.integration.test.ts`: 15/15 passed.
- Repository gates (`node scripts/verify-docs.mjs`, `node scripts/verify-solopreneur-gate-matrix.mjs`, `pnpm db:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`): all green.
