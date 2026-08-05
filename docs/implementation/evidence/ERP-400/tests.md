# ERP-400 test evidence

## Repository quality gate

```sh
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" TURBO_FORCE=true pnpm check
```

Result: pass. Formatting, ESLint, all package typechecks, documentation/security/fixture verifiers, unit/component suites and production builds passed with Turbo cache bypassed.

Relevant counts from the fresh run:

- domain: 18 files, 85 tests passed;
- contracts: 2 files, 6 tests passed;
- CLI: 2 files, 78 tests passed;
- web: 10 files, 22 tests passed;
- API: 12 files, 35 tests passed; PostgreSQL suites skipped locally by their explicit environment guard;
- worker: 6 tests passed, 2 integration tests skipped locally.

## Migration and rendered UI

```sh
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" pnpm db:check
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" pnpm test:e2e
```

Results:

- migration directory valid with 20 entries;
- Playwright desktop/mobile: 4/4 passed;
- `/banking` desktop and 412x915 mobile rendered without console or page errors;
- account dialog interaction passed;
- the initial mobile header compression found during visual QA was repaired and protected by geometry assertions.

The in-app Browser runtime returned `No browser is available`; rendered QA therefore used the repository Playwright workflow and a temporary external Playwright screenshot check.

## CI-required coverage

The authored PostgreSQL integration tests require `RUN_DB_INTEGRATION=1`. GitHub CI is the authoritative proof for migration execution, constraints, immutable triggers, concurrent duplicate imports, org isolation, audit and outbox behavior.
