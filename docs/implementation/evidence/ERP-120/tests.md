# ERP-120 test evidence

Node runtime: `v22.21.1`.

Commands:

```sh
pnpm check
pnpm db:check
```

Results:

- Domain: 6 files passed, 22 tests passed.
- Allocation tests cover exact 100%, under-allocation, exact minor-unit source totals and residual metadata.
- Format, lint, typecheck, documentation/security checks and builds passed across 9 packages.
- Migration directory validation passed with 5 entries.
- PostgreSQL integration is delegated to exact-commit CI because no local PostgreSQL daemon is available.

Exact-commit CI [30984361579](https://github.com/leolionart/naai-erp/actions/runs/30984361579) passed frozen install, quality gates, empty PostgreSQL 16 migration and all six database integration tests.
