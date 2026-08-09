# ERP-857 test evidence

Executed on 2026-08-09:

- API, web and CLI typecheck: passed.
- Focused workbook/service/workforce unit suite: 4 files, 14 tests passed.
- PostgreSQL management workbook, identity metadata and worker correction suite: 3 files, 5 tests
  passed.
- Worker CLI full suite: 113 tests passed (agent evidence).
- `pnpm db:check`: passed; 44 migration entries valid.
- `pnpm test:docs`: passed; 11 ADRs, 12 rule references and 27 AI relationship resources verified.
- `git diff --check`: passed.
- LibreOffice/PDF render: seven pages for seven management sheets; all sheets visually reviewed.

Focused commands are registered as `T-UNIT-ERP-857-001`, `T-UNIT-ERP-857-002`,
`T-INT-ERP-857-003`, `T-UNIT-ERP-857-004`, `T-INT-ERP-857-005` and
`T-INT-ERP-857-006` in the test catalog.
