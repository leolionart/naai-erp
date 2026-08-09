# ERP-855 tests

- Fresh database `naai_erp_erp855_test` migrated through 41 migrations: passed.
- `RUN_DB_INTEGRATION=1 ... master-data.integration.test.ts`: 10/10 passed, including create,
  structured invalid-rate rejection, update from 8% to 10%, deactivate and version readback.
- Master-data service and resource-registry unit tests: 10/10 passed.
- CLI client/main focused suite: 129 passed on the first combined run except one unrelated portable
  package test timed out at 5 seconds; rerun with a 15-second timeout passed 17/17 main tests. The
  complete repository check later passed the CLI suite with 131 passed and 1 real-data test skipped.
- `pnpm check`: passed format, lint, all-package typecheck, documentation, security baseline, golden
  fixtures, native database tests, unit suites and production build.
- Repository-wide API result: 122 passed, 93 database integration tests skipped by the non-DB unit
  phase; required ERP-855 database integration was run separately and passed.
- Node 26 emitted an engine warning because the repository declares Node 22–24; no gate failed.
