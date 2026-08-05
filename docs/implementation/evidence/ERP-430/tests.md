# ERP-430 test evidence

## Local executable proof

```sh
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" TURBO_FORCE=true pnpm check
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" pnpm db:check
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" pnpm test:e2e
```

Results:

- fresh full check passed: format, lint, typecheck, docs, security, fixtures, unit tests and production builds;
- domain: 21 files / 114 tests, including 16 aging boundary/invariant tests;
- contracts: 12 tests; CLI: 110 tests;
- API: 16 files / 43 unit tests, with authored PostgreSQL historical aging integration cases;
- web: 13 files / 28 unit/component tests;
- `GF-AGING-001` verifies boundary days, partial settlements, customer credit, supplier advance and exact AR/AP control ties;
- migration directory remains valid with 22 entries; ERP-430 required no new schema/migration;
- Playwright desktop/mobile: 12/12 passed, including separate AR/AP queues, URL filters, party drill-down and responsive behavior;
- localhost `/receivables` and `/payables` return HTTP 200; runtime OpenAPI exposes AR/AP aging operations.

Local PostgreSQL integration execution remains unavailable because no PostgreSQL listener/Docker daemon is present. Exact-commit GitHub CI must execute the authored integration suite before closure.
