# ERP-800: Cash Data Adjustment Tests

## Validation

**Test ID**: `ERP-800-MANUAL-ADJUSTMENT`

**Execution**:
The adjustment was performed on `2026-08-07` via automated scripts driving the core `NaaiErpClient` SDK.

**Scripts Run**:

1. `npx tsx scripts/execute-cash-adjustment.ts --commit`
2. `npx tsx scripts/approve-post-journals.ts`

**Database Verification**:
Querying the `journal_entries` table confirmed:

1. The 9 original expense journals (e.g. `journal-expense-import-expense-345ed...`) successfully transitioned to `reversed` state.
2. The 9 new replacement journals transitioned to `posted` state.

```sql
SELECT state FROM journal_entries WHERE description LIKE '%Rút tiền mặt sử dụng%';
-- 4 rows reversed
-- 4 rows posted
```

The data conforms to `ADR-003` because journals were properly reversed and replaced, leaving the history immutable.

## API and CLI parity validation

```text
pnpm --filter @naai-erp/cli exec vitest run src/main.test.ts
# 1 file passed, 8 tests passed

pnpm test:docs
# Verified 9 accepted ADRs and 10 rule references
```

The CLI regression test proves that `operating-dashboard get` calls the canonical
`/api/v1/organizations/{organizationId}/reports/operating-dashboard` endpoint rather than falling
through to the generic master-data route.
