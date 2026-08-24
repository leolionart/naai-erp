# ERP-932 tests

- Contracts, web and API typecheck: passed.
- Web unit suite: 29 files, 96 tests passed.
- Contracts unit suite: 41 files, 89 tests passed.
- Recognition PostgreSQL integration: 2 tests passed, including the 2025 enriched fixture.
- Project-profitability PostgreSQL integration: 1 test passed.
- Targeted desktop/mobile Playwright regression: 5 tests passed.
- `pnpm lint`: passed for all 10 packages.
- `pnpm test:docs`: passed.
- `pnpm test:security-baseline`: passed.
- `git diff --check`: passed.

The local Node runtime was v26 and emitted the repository engine warning (`>=22 <25`); all commands
completed successfully.
