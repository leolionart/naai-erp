# ERP-610 test evidence

## Independent fixture

```sh
node tests/fixtures/golden/GF-FORECAST-002/verify.mjs
```

The fixture-local verifier checks file hashes, exact component weighting, the manually reviewed revenue/expense/cash totals, zero-difference controls, duplicate commercial-source rejection, owner-funding financing classification and maker-checker identities. It does not import production packages.

## Local integrated results

```sh
pnpm --filter @naai-erp/domain test
pnpm --filter @naai-erp/contracts test
pnpm --filter @naai-erp/database test
pnpm --filter @naai-erp/cli test
pnpm --filter @naai-erp/web typecheck
pnpm --filter @naai-erp/web test
pnpm check
pnpm db:check
pnpm test:fixtures
pnpm test:e2e
```

Results from the integrated worktree:

- `pnpm check`: pass, covering formatting, lint, typecheck, docs/security/fixture checks, unit suites and production builds.
- `pnpm db:check`: pass for the complete migration chain including ERP-610 schema.
- `pnpm test:fixtures`: pass, including `GF-FORECAST-002` after it was registered by the integrated fixture runner.
- `pnpm test:e2e`: 37/37 pass. ERP-610 journeys live in `apps/web/e2e/planning.spec.ts`; the file has seven planning tests covering target/scenario flows plus composition source Drawer, reasoned review, component creation, edit/delete lifecycle, URL filters and responsive routes.
- Domain, contracts, database, CLI and web checks pass as part of the full repository run.

## PostgreSQL and exact-commit proof

The ERP-610 PostgreSQL integration command is:

```sh
RUN_DB_INTEGRATION=1 pnpm --filter @naai-erp/api test -- forecast-component.integration
```

The PostgreSQL integration test covers two durability controls in addition to formula and authorization behavior:

- forecast publish validates composition, calculates the result and stores forecast state plus `composition_snapshot` atomically in the same transaction;
- after publish, insertion of a late backdated recognition event does not change readback of the retained 90,000,000 projected-revenue snapshot.

It was not run locally because no local PostgreSQL service was available. These PostgreSQL assertions and the complete quality job must pass for the exact pushed commit in GitHub Actions before ERP-610 is marked done.
