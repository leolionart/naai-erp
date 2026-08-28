# Tests

- `pnpm --filter @naai-erp/database exec tsc --noEmit` — passed.
- `pnpm --filter @naai-erp/api exec tsc --noEmit` — passed.
- `pnpm --filter @naai-erp/web exec tsc --noEmit` — passed.
- `pnpm --filter @naai-erp/web test -- --runInBand` — 32 files, 108 tests passed.
- `pnpm --filter @naai-erp/api exec vitest run src/master-data/master-data.service.test.ts src/master-data/resource-registry.test.ts` — 11 tests passed.
- `pnpm --filter @naai-erp/database db:check` — migration directory valid.
- `pnpm test:docs` — passed.
