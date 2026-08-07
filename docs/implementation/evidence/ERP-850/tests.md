# ERP-850 Tests

- `pnpm --filter @naai-erp/contracts test -- portable-data-package`: 58 tests passed in 25 files.
- `pnpm --filter @naai-erp/domain test -- portable-data-package`: 187 tests passed in 37 files.
- `pnpm --filter @naai-erp/api exec vitest run src/portable-data-packages src/commercial-documents src/expenses`: 31 tests passed, 7 integration tests skipped by environment guards.
- `pnpm --filter @naai-erp/cli test`: 121 tests passed, 1 skipped; the package test script is scoped to source and no longer discovers stale `dist` tests.
- `pnpm --filter @naai-erp/database typecheck`: passed.
- `pnpm --filter @naai-erp/api typecheck`: passed.
- `pnpm --filter @naai-erp/cli typecheck`: passed.
- `pnpm db:check`: passed; migration directory valid.
- `pnpm test:docs`: passed; 11 ADRs and 12 required rule references verified.
- Local migration: 35 migrations on disk and applied; native database healthy.
- Web navigation tests: 2/2 passed; portable data package Playwright desktop flow passed and the
  390px mobile flow passed without horizontal overflow.
- Live export at cutoff `2026-08-07`: HTTP 201, 106 included sheets, 4 explicit exclusions,
  714 rows, XLSX SHA-256
  `9c1303c19a087ada002ac3122996ca738279bb72db54f46a89638c1d385436a9`.
- Live unchanged dry-run: HTTP 201, 106 sheets, 714 unchanged, zero invalid/conflict/ready,
  `mutationCount=0`, valid=true.
- Live unchanged commit: HTTP 201, state `committed`, zero business mutations.
- Live edited workbook dry-run: one new party row `ready`, 714 unchanged, zero invalid/conflict;
  commit applied exactly one mutation and canonical API readback returned the created party.
- Before/after reconciliation: row counts and SHA-256 controls stayed identical for journals,
  journal lines, commercial documents/lines, expenses/lines, bank transactions and payment
  reconciliations.
