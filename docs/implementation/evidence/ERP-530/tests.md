# ERP-530 test evidence

## Local verification

```sh
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" TURBO_FORCE=true pnpm check
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" pnpm db:check
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" pnpm test:e2e
```

Results:

- full monorepo check passed;
- database migration validation passed with 27 migrations;
- Playwright passed 27/27 scenarios;
- overhead policy, source-pool and run routes are exercised through backend, contract/CLI and responsive UI coverage;
- PostgreSQL integration coverage asserts balanced overhead journals, project-dimension totals, linked reversal, original journal state and original-plus-reversal net zero; it is authored locally and awaits exact-commit CI execution with PostgreSQL;
- persisted allocation snapshots, resource versions and fiscal-period workflow are covered by commit `602d9f8ce8b96acb21f5f414ccbb9c9acbd9b2e5`.

## Exact-commit requirement

These results describe the current local worktree. ERP-530 must remain `review` until the uncommitted contract, CLI and UI work is committed and the resulting pushed SHA passes the same checks in GitHub Actions. Local success or CI for an earlier backend-only SHA is not sufficient for final acceptance.
