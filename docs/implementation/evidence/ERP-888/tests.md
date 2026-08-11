# ERP-888 tests

- PostgreSQL banking integration and service tests on a fresh migrated database: 17 passed.
- Contracts unit: 4 passed.
- CLI client regression: 116 passed.
- Owner Current Playwright desktop/mobile: 2 passed.
- API, database, contracts, CLI and Web typecheck/lint: passed.
- Migration validation, docs verification, Prettier and `git diff --check`: passed.
- In-app Browser QA: dialog visible with date, source account, formatted amount and note; no relevant
  console errors; no production-like financial mutation was submitted during rendered QA.
