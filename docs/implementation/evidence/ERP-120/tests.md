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
