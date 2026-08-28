# Tests

- `pnpm --filter @naai-erp/api lint` — passed.
- `pnpm --filter @naai-erp/api test` — 187 passed, 116 skipped.
- Targeted commercial-document and quick-purchase tests — 25 passed, 12 skipped (DB integration
  requires `RUN_DB_INTEGRATION=1` and `DATABASE_URL`).
