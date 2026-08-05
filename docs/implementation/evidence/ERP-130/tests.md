# ERP-130 test evidence

Node runtime: `v22.21.1`.

Commands: `pnpm check`, `pnpm db:check`.

Results:

- Domain: 7 files passed, 26 tests passed.
- Party tests cover multi-role identity, merge preservation and cross-org rejection.
- Project tests cover lifecycle, closed allocation rejection, approved reopen, exact contracts and milestones.
- Repository quality gate and build passed across 9 packages.
- Migration directory validation passed with 6 entries.
- Exact PostgreSQL integration awaits pushed-commit CI.

Exact-commit CI [30985245942](https://github.com/leolionart/naai-erp/actions/runs/30985245942) passed empty PostgreSQL 16 migration and all seven integration tests.
