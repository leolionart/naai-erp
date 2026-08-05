# ERP-100 test evidence

Node runtime: `v22.21.1`.

## Targeted domain

Command: `pnpm --filter @naai-erp/domain test`

Result: 4 files passed, 10 tests passed.

## Clean PostgreSQL migration and integration

Database: ephemeral `postgres:16-alpine`, database `naai_erp` on host port `55433`.

Commands:

```sh
DATABASE_URL=postgresql://naai_erp:naai_erp@localhost:55433/naai_erp pnpm db:migrate
DATABASE_URL=postgresql://naai_erp:naai_erp@localhost:55433/naai_erp pnpm --filter @naai-erp/database test
pnpm db:check
```

Results:

- Empty database migration passed.
- 1 integration test file passed, 3 tests passed.
- Cross-organization composite foreign keys rejected invalid membership-role and fiscal-period writes.
- `numeric(38,18)` exchange rate round-tripped as the exact string `26125.500000000000000000`.
- Migration directory validation passed with 3 entries.

## Repository gate

Command: `pnpm check`

Result: passed format, ESLint, package lint, typecheck, documentation checks, security baseline, test suites and production builds across 9 packages. The database integration suite is intentionally skipped by the generic test command when `DATABASE_URL` is absent; it passed explicitly against the clean PostgreSQL container above.

## Remote CI

Exact implementation commit: `232783ce0b91095df81eab9dba598cab3d5773b7`.

Run: [GitHub Actions 30982155835](https://github.com/leolionart/naai-erp/actions/runs/30982155835)

Result: passed `pnpm install --frozen-lockfile`, `pnpm check` and `pnpm db:check`.
