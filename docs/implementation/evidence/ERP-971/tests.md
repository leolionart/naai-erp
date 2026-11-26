# ERP-971 Tests

- `DATABASE_URL="postgresql:///naai_exp_69591?host=/tmp" RUN_DB_INTEGRATION=1 npx vitest run src/expenses/expense.integration.test.ts`: 12/12 passed (including regression test for solopreneur owner approving and posting an API-created draft without separate tax review, and controlled mode still returning 422 `EXPENSE_REVIEW_INCOMPLETE`).
- Full repo gates (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `node scripts/verify-docs.mjs`, `node scripts/verify-solopreneur-gate-matrix.mjs`) run after final edits.
