# ERP-1007 tests

Executed against an isolated PostgreSQL 16 instance (`port 55440`, fresh database `naai_a`):

- `pnpm --filter @naai-erp/api lint` — pass (`tsc --noEmit`, 0 errors)
- `npx eslint apps/api/src` — pass (0 errors)
- `pnpm check:file-size -- --update && pnpm check:file-size` — pass (`pg-report-export.store.ts` reduced to 1650 code lines; all new files <= 500 lines)
- `node scripts/list-endpoint-inventory.mjs --check` — pass (`List endpoint inventory is current.`)
- `pnpm test:docs` — pass (`Verified 11 accepted ADRs, 12 rule references, and 29 AI relationship resources.`)
- `RUN_DB_INTEGRATION=1 pnpm --filter @naai-erp/api exec vitest run src/internal-transfers/keyset-lists-erp1007.integration.test.ts` — pass (4 tests: >100 rows per table, default 50 bound, full cursor walk without duplicates/gaps, `q`, `sort=date_asc`, `includeTotal`, invalid `sort`/`limit`/`cursor` -> 400, RBAC order)
- `RUN_DB_INTEGRATION=1 pnpm --filter @naai-erp/api exec vitest run --maxWorkers=1` (fresh migrated DB) — pass (`108 passed | 3 skipped` test files, `421 passed | 6 skipped` tests, 0 failures)
