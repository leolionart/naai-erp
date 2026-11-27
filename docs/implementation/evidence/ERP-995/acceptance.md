# ERP-995 — Acceptance

- `BR-READ-001` / `BR-READ-002` / `BR-READ-003`: shared paging contract in `packages/contracts/src/paging.ts` enforces default limit 50, max 100/200 clamping with `limitClamped`, keyset cursor encoding/decoding (`CURSOR_INVALID`), and 256 KB response size budget (`meta.truncated`, `meta.bytes`).
- `T-UNIT-READ-001`: verified in `packages/contracts/src/paging.test.ts` (6/6 tests).
- `T-INT-READ-001`: verified via `pnpm check:list-inventory`, OpenAPI parameters in `docs/api/openapi-v1.json`, and `apps/api/src/expenses/expense-list.integration.test.ts`.
