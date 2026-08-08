# ERP-852 tests

Validation performed on 2026-08-08:

- `pnpm db:check` — passed; 38 migrations validated.
- Fresh-database API integration with `RUN_DB_INTEGRATION=1` and `--maxWorkers=1` — passed.
- Fresh-database worker integration — passed, 8/8 tests.
- Targeted desktop/mobile Playwright coverage for the funding-policy settings and dashboard contract
  — passed during the affected-suite runs.
- `pnpm check` — passed after regenerating/fixing the OpenAPI registry contract.
- `pnpm build` — passed.

The full Playwright suite was executed serially after repairing three stale dashboard/tax-report
assertions: `87 passed (3.0m)`.
