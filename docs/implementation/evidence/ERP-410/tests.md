# ERP-410 test evidence

## Fresh repository gate

```sh
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" TURBO_FORCE=true pnpm check
```

Result: pass with Turbo cache bypassed.

Relevant counts:

- domain: 19 files, 92 tests passed, including generated partial-allocation cases;
- contracts: 2 files, 7 tests passed;
- CLI: 2 files, 84 tests passed;
- web: 11 files, 24 tests passed;
- API: 13 files, 38 tests passed; PostgreSQL suites skipped locally by their environment guard;
- GF-BANK-001 executed by `pnpm test:fixtures` and passed.

## Migration and UI

```sh
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" pnpm db:check
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" pnpm test:e2e
```

Results:

- migration directory valid with 21 entries;
- Playwright desktop/mobile: 6/6 passed;
- desktop flow covers candidate factors, partial allocation, canonical match, reconcile lock and journal/evidence drill-down;
- mobile reconciliation route has no horizontal overflow;
- local `/banking` and API health both return HTTP 200.

The in-app Browser runtime was unavailable in this session, so rendered validation used the repository Playwright workflow and visual screenshot inspection.

## CI-required coverage

Exact-commit GitHub CI must execute migration 0018 and the PostgreSQL integration journey with `RUN_DB_INTEGRATION=1`: suggest, candidate readback, match, partial reconcile, balanced journal, document state, organization denial, over-allocation protection and unreconcile/reversal history.

The first exact-commit CI run (`31013660054`) exposed two accidental required columns on the reconciliation parent table that belong only to child attempts. The schema, migration snapshot and migration SQL were corrected; the database integration fixture remains the regression proof on the repair commit.
