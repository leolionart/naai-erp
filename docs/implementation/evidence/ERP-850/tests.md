# ERP-850 Tests

- `pnpm --filter @naai-erp/contracts test -- portable-data-package`: 58 tests passed in 25 files.
- `pnpm --filter @naai-erp/domain test -- portable-data-package`: 187 tests passed in 37 files.
- `pnpm --filter @naai-erp/api exec vitest run src/portable-data-packages`: 5 tests passed.
- `pnpm --filter @naai-erp/cli exec vitest run src/main.test.ts`: 11 tests passed.
- `pnpm --filter @naai-erp/database typecheck`: passed.
- `pnpm --filter @naai-erp/api typecheck`: passed.
- `pnpm --filter @naai-erp/cli typecheck`: passed.
- `pnpm db:check`: passed; migration directory valid.
- `pnpm test:docs`: passed; 11 ADRs and 12 required rule references verified.
- Local migration: 35 migrations on disk and applied; native database healthy.
- Live export at cutoff `2026-08-07`: HTTP 201, 107 included sheets, 3 explicit exclusions,
  591 rows, XLSX size 155,265 bytes, SHA-256
  `0f87b5d901f187e1cf046a46c01427f6aaa8c88190df6186895ff3a017fff29a`.
- Live unchanged dry-run: HTTP 201, 107 sheets, 591 unchanged, zero invalid/conflict/ready,
  `mutationCount=0`, valid=true.
- Live unchanged commit: HTTP 201, state `committed`, zero business mutations.
