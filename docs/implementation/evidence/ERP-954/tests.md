# Tests

- `pnpm --filter @naai-erp/api typecheck` — passed.
- `pnpm --filter @naai-erp/api exec vitest run src/banking/banking.service.test.ts src/operating-dashboard/operating-dashboard.service.test.ts` — 13 tests passed.
- `pnpm --filter @naai-erp/api exec vitest run src/operating-dashboard/operating-dashboard.integration.test.ts` — integration file skipped because the local integration database gate is not enabled.

PROD read-only audit (2026-08-30) confirmed the shared-ledger condition and showed 37/53 bank rows in
`ignored` state; no ignored rows were auto-reconciled.

After the duplicate-transfer and custody reclassification corrections, the PROD ledger reports
`111-CASH=1,910,850₫`, `112-BANK=78,333,660₫` and `3388-OWNER=-57,038,831₫`. The four reversal API
calls each returned HTTP 201 and created a reversal journal; the posted originals remain immutable
and linked. The running PROD image still needs the latest dashboard code before its cash-card values
reflect the corrected shared-ledger aggregation.
