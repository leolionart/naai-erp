# ERP-879 tests

- `node -e "...verify migration journal tail..."` — passed; entry 46 resolves to
  `0046_expense_quick_edit_metadata`.
- `pnpm test:docs` — passed.
- `pnpm format:check` — passed.
- `pnpm --filter @naai-erp/api exec vitest run src/expenses/expense.integration.test.ts` — command
  passed but the database integration suite was skipped because `RUN_DB_INTEGRATION` and a local
  PostgreSQL test database were unavailable in this session.
- Production `migrate` image at revision `73fb9740...` exited successfully but did not apply 0046;
  the production API readback still returned `FINAL_EXPENSE_IMMUTABLE`, proving the missing journal
  registration.
