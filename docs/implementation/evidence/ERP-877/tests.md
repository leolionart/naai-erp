# ERP-877 tests

- `pnpm --filter @naai-erp/database db:check` — pass; 49 migrations valid.
- `pnpm --filter @naai-erp/api typecheck` — pass.
- `pnpm --filter @naai-erp/web typecheck` — pass.
- `pnpm --filter @naai-erp/api exec vitest run src/expenses/expense.service.test.ts src/expenses/expense.integration.test.ts` — 16 pass; 10 PostgreSQL integration cases skipped because `DATABASE_URL` is not configured.
- `pnpm --filter @naai-erp/web exec playwright test e2e/focused-records.spec.ts --project=desktop-chromium --grep 'T-E2E-ERP-877-002'` — 1 pass.
- `pnpm test:docs` — pass.
- `pnpm format:check` — pass.
- `git diff --check` — pass.
- Browser readback on `http://localhost:3000/expenses` — one `Lưu thay đổi` button, no `Lưu danh mục`, no redundant detail footer; payee and purpose controls visible.
