# ERP-913 tests

- `pnpm --dir apps/api exec vitest run src/commercial-documents/quick-purchase-invoice.service.test.ts src/commercial-documents/commercial-document.service.test.ts` — passed, 19 tests.
- `DATABASE_URL=... RUN_DB_INTEGRATION=1 pnpm --dir apps/api exec vitest run src/commercial-documents/commercial-document.integration.test.ts` — passed, 10 tests.
- `pnpm --filter @naai-erp/cli test` — passed, 116 passed and 1 skipped.
- `pnpm --filter @naai-erp/web exec vitest run src/components/automation-api-dialog.test.ts` — passed, 11 tests.
- Focused Expense deletion Playwright run, desktop Chromium, one worker — passed, 3 tests.
- Focused automation-dialog Playwright runs, desktop and mobile Chromium, one worker — passed, 2 tests.
- `pnpm --filter @naai-erp/api lint` and `pnpm --filter @naai-erp/web lint` — passed.
- `pnpm test:docs` and JSON parse checks — passed.
- `pnpm check` — every format, lint, typecheck, docs/security/fixture/native-db, repository test and
  production build stage completed successfully. Turbo remained resident after printing the final
  successful build summary and was terminated without touching the user's localhost application.

The initial parallel Playwright attempt shared a dev server and produced unrelated token-fixture
timeouts. The affected Expense desktop/mobile cases were rerun sequentially and passed.

# Follow-up regression evidence

- `pnpm --filter @naai-erp/api exec vitest run src/commercial-documents/quick-purchase-invoice.service.test.ts` — 8 tests passed.
- `pnpm --filter @naai-erp/web exec vitest run src/components/automation-api-dialog.test.ts` — 13 tests passed.
- `pnpm --filter @naai-erp/api exec tsc --noEmit` and `pnpm --filter @naai-erp/web exec tsc --noEmit` — passed.
- Prettier check for all changed API/web/docs files — passed.
