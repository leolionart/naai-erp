# ERP-870 tests

- Domain focused tests: 7 passed.
- Contract focused tests: 2 passed.
- API subscription, portable-adapter and registry tests: 14 passed.
- CLI tests: 133 passed, 1 skipped; ERP-870 focused cases passed.
- Database integration with local PostgreSQL: 3 passed.
- Web subscription E2E: 2 passed (desktop Chromium and mobile Chromium).
- API, CLI and web TypeScript checks: passed.
- Documentation verification: passed with 29 AI relationship resources.
- Local migration readback: 46 migrations on disk, 46 applied, healthy.
- `git diff --check`: passed.

The database integration suite is environment-gated and was explicitly rerun with the local
`DATABASE_URL` after applying migration `0045_customer_service_subscriptions`.
