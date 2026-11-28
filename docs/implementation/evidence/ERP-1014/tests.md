# ERP-1014 Tests

## Focused Unit, DLS & Documentation Tests

- `pnpm --filter @naai-erp/api exec vitest run src/telegram-settings/telegram-settings.service.test.ts` — 7 passed
- `pnpm --filter @naai-erp/web exec vitest run src/app/workspaces/telegram-settings-workspace.test.tsx src/components/dls-compliance.test.ts` — 9 passed (2 test files)
- `RUN_DB_INTEGRATION=1 DATABASE_URL=postgresql://naai_erp:naai_erp@127.0.0.1:5432/naai_erp pnpm --filter @naai-erp/api exec vitest run src/telegram-settings/pg-telegram-settings.integration.test.ts` — 2 passed
- `pnpm test:docs && pnpm check:file-size` — passed

## Repository Quality Gate

- `pnpm format && pnpm check` — passed (lint, typecheck, unit/contract suites, docs verification, file-size ratchet)
