# ERP-984 Tests

- `pnpm --filter @naai-erp/domain exec vitest run src/aging.test.ts`: 17 passed (including mixed supplier invoice and freelance payable tie-out on account `331`).
- `DATABASE_URL=postgresql://naai_erp:naai_erp@127.0.0.1:5432/naai_erp_erp984_test pnpm db:migrate` + `RUN_DB_INTEGRATION=1 pnpm --filter @naai-erp/api exec vitest run src/aging/aging.service.test.ts src/aging/aging.integration.test.ts src/project-freelance-payables/project-freelance-payable.integration.test.ts`: all passed on a clean scratch PostgreSQL database (`T-INT-AP-001`).
- Quality gates: `node scripts/verify-docs.mjs`, `pnpm lint`, and `pnpm typecheck` passed.
