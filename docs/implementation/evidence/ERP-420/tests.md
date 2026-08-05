# ERP-420 test evidence

## Local executable proof

```sh
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" TURBO_FORCE=true pnpm check
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" pnpm db:check
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" pnpm test:e2e
```

Results:

- fresh full check passed: format, lint, typecheck, docs, security, fixtures, unit tests and production builds;
- domain: 20 files / 98 tests, including six internal-transfer invariant tests;
- contracts: 10 tests; CLI: 98 tests including headless discovery;
- API: 15 files / 41 unit tests, including internal-transfer service and discovery;
- web: 12 files / 26 unit/component tests;
- `GF-TRANSFER-001` verified balanced journals, zero transit and zero principal P&L;
- migration directory valid with 22 entries and one ERP-420 migration (`0019_calm_piledriver.sql`);
- Playwright desktop/mobile: 9/9 passed, including create, candidate Sheet, pair Dialog, reasoned unmatch AlertDialog and responsive list/detail routes;
- localhost list route and API health return HTTP 200; runtime OpenAPI exposes internal-transfer schemas and capabilities advertise the resource.

PostgreSQL integration cases are authored for CI. Local execution was attempted but the host currently has no PostgreSQL listener or Docker daemon (`ECONNREFUSED 127.0.0.1:5432`), so exact-commit GitHub CI is the required database proof before task closure.

## Exact-commit CI

GitHub Actions run https://github.com/leolionart/naai-erp/actions/runs/31018732152 passed for commit `7a538a09e4b39ebf3173df3d72753f708271569b`.

The run executed the clean check, migration apply, PostgreSQL database/API/worker integration suites and nine Playwright desktop/mobile cases. This supplies the database-backed proof unavailable on the local host and closes ERP-420.
