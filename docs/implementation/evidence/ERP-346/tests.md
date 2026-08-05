# ERP-346 Tests

- `pnpm test:fixtures` — PASS for both expense fixtures: hashes, exact rows, balance, allocation and tax views.
- `pnpm --filter @naai-erp/api typecheck` — PASS.
- `pnpm --filter @naai-erp/api test` — PASS locally: 32 unit tests; PostgreSQL integration scenarios skip without `RUN_DB_INTEGRATION=1`.
- `pnpm --filter @naai-erp/web test` — PASS: 9 files / 20 tests; E2E directory is explicitly excluded from Vitest.
- `pnpm test:e2e` — PASS: 2 tests, desktop Chromium and Pixel 7 Chromium.
- `pnpm check` — PASS including the new independent fixture gate.
- `git diff --check` — PASS.

CI installs Chromium, runs the new E2E command and runs the ERP-346 PostgreSQL integration through the existing `RUN_DB_INTEGRATION=1` API step. Exact-commit verification is pending.
