# ERP-858 tests

- `pnpm --filter @naai-erp/database db:check` — passed, 45 migration entries valid.
- `pnpm --filter @naai-erp/database typecheck` — passed.
- `pnpm --filter @naai-erp/api typecheck` — passed.
- `pnpm --filter @naai-erp/web typecheck` — passed.
- Targeted API Vitest set — 37 passed; the first run skipped 7 database-dependent cases.
- Fresh PostgreSQL 16.9 migration plus ERP-858 commercial-document, expense and financial-statement
  integration suites — 3 files and 23/23 tests passed.
- `pnpm --filter @naai-erp/web test:e2e -- e2e/expense-category-policies.spec.ts` — 1 passed.
- `git diff --check` — passed.
