# Tests

- `pnpm --filter @naai-erp/api typecheck` — passed.
- `pnpm exec prettier --check apps/api/src/operating-dashboard/pg-operating-dashboard.store.ts apps/web/src/app/workspaces/dashboard-workspaces.tsx` — passed.
- `pnpm --filter @naai-erp/web typecheck` — passed.
- `pnpm --filter @naai-erp/web exec vitest run src/app/workspaces/dashboard-workspaces.test.ts` — 3 passed.
- `pnpm --filter @naai-erp/api exec vitest run src/operating-dashboard/operating-dashboard.integration.test.ts` — skipped without `RUN_DB_INTEGRATION=1`.
