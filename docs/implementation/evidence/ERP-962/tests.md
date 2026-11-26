# Tests

- `pnpm --filter @naai-erp/worker test; RUN_DB_INTEGRATION=1 integration tests against a scratch Postgres (all migrations applied, then dropped)` — passed
- `pnpm --filter @naai-erp/api test src/telegram-settings` — passed
- `pnpm --filter @naai-erp/cli test` — passed
