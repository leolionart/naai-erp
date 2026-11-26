# ERP-987 Tests

## Commands & Results

1. **Empty-DB Migration (`0001`..`0078`) and Scratch-PostgreSQL Integration Suite (`T-INT-CLOSE-001` + regressions)**:
   - Command:
     `DATABASE_URL="postgresql://naai_erp:naai_erp@127.0.0.1:5432/$SCRATCH_DB" pnpm db:migrate && RUN_DB_INTEGRATION=1 DATABASE_URL="postgresql://naai_erp:naai_erp@127.0.0.1:5432/$SCRATCH_DB" pnpm --filter @naai-erp/api exec vitest run src/period-close/period-close.integration.test.ts src/operating-dashboard/operating-dashboard.integration.test.ts src/payment-evidence/payment-evidence.integration.test.ts src/aging/aging.integration.test.ts`
   - Result: `migrations applied successfully!`, `4 passed (4) test files`, `13 passed (13) tests` (`period-close.integration.test.ts`: 3 passed; `operating-dashboard.integration.test.ts`: 6 passed; `payment-evidence.integration.test.ts`: 1 passed; `aging.integration.test.ts`: 3 passed).

2. **CLI Unit & Contract Routing Suite**:
   - Command: `CI=1 pnpm --filter @naai-erp/cli test`
   - Result: `10 passed (10) test files`, `137 passed | 1 skipped (138)` (including `period-close-cli.test.ts` and `funding-client-routes.test.ts`).

3. **Web UI Unit & Navigation Suite**:
   - Command: `CI=1 pnpm --filter @naai-erp/web test`
   - Result: `42 passed (42) test files`, `142 passed (142) tests`.

4. **Fiscal Period Service Unit Suite**:
   - Command: `CI=1 pnpm --filter @naai-erp/api exec vitest run src/fiscal-periods/fiscal-period.service.test.ts`
   - Result: `1 passed (1) test file`, `2 passed (2) tests`.

5. **Repository Quality & Governance Gates**:
   - `pnpm db:check` -> `Migration directory is valid (81 entries).`
   - `node scripts/verify-docs.mjs` -> `Verified 11 accepted ADRs, 12 rule references, and 29 AI relationship resources.`
   - `node scripts/verify-solopreneur-gate-matrix.mjs` -> `Verified 135/135 OpenAPI mutations; no financial surface is classified none.`
   - `CI=1 pnpm lint` -> `0 errors` (no `max-lines` warnings on any new file).
   - `CI=1 pnpm typecheck` -> `10 successful, 10 total`.
   - `CI=1 pnpm format:check` -> clean.
