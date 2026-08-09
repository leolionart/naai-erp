# ERP-853 tests

## 2026-08-09 regression

- Fixed `empty-organization-restore.integration.test.ts` so its export cutoff remains after dynamically-created fixture rows. The previous fixed `2026-08-08` cutoff caused CI runs after that date to export an empty package and report `balancedJournalCount: 0`.

- `RUN_DB_INTEGRATION=1 DATABASE_URL=... pnpm --filter @naai-erp/api exec vitest run src/portable-data-packages/empty-organization-restore.integration.test.ts` — 1/1 passed.
- `RUN_DB_INTEGRATION=1 DATABASE_URL=... ERP853_FULL_PACKAGE_PATH=outputs/erp-851/naai-portability-audit.xlsx pnpm --filter @naai-erp/api exec vitest run src/portable-data-packages/empty-organization-restore.full-package.integration.test.ts` — 1/1 passed against the current 7,542-row source package; temporary target cleaned afterward.
- Portable service tests — 11/11 passed.
- CLI focused tests — 124/124 passed.
- API and CLI typecheck passed; contracts 63/63 passed; scoped diff check passed.
