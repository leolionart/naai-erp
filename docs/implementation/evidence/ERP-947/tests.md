# Tests

- `pnpm --filter @naai-erp/api lint` — passed.
- `pnpm --filter @naai-erp/api test` — 187 passed, 116 skipped.
- `pnpm --filter @naai-erp/api exec vitest run src/commercial-documents/commercial-document.service.test.ts src/expenses/expense.service.test.ts` — 34 passed.
- DB integration regression is covered in the commercial-document and expense integration suites; it requires `RUN_DB_INTEGRATION=1` and a configured `DATABASE_URL`.
- `pnpm --filter @naai-erp/api exec vitest run src/commercial-documents/commercial-document.service.test.ts src/commercial-documents/quick-purchase-invoice.service.test.ts src/commercial-documents/commercial-document.integration.test.ts` — 25 passed, 12 skipped (DB integration skipped without `DATABASE_URL`).
- `pnpm --filter @naai-erp/api lint` — passed after owner-paid and fingerprint changes.
