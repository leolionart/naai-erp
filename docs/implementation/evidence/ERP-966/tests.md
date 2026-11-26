# Tests

- `pnpm test` (all packages) — passed
- `RUN_DB_INTEGRATION=1 vitest src/operating-dashboard` on a scratch Postgres — passed
- `src/financial-statements` and `src/executive-metrics` integration: 4 tests fail identically on the unmodified baseline (pre-existing: VAT reconciliation fixture returns no journals; executive policy id mismatch). Not caused by this change.
