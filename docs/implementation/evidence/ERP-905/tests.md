# ERP-905 tests

- `pnpm --filter @naai-erp/database typecheck` — passed.
- `pnpm --filter @naai-erp/database db:check` — passed; 54 migration entries valid.
- `pnpm --filter @naai-erp/database test` — passed; 14 tests passed, 20 database-dependent tests skipped.
- `pnpm --filter @naai-erp/database exec vitest run src/remove-obsolete-cost-systems-migration.test.ts` — passed; 1 test.
- `pnpm --filter @naai-erp/contracts typecheck` — passed.
- `pnpm --filter @naai-erp/domain typecheck` — passed.
- `pnpm --filter @naai-erp/api typecheck` — passed.
- `pnpm --filter @naai-erp/cli typecheck` — passed.
- `pnpm --filter @naai-erp/web typecheck` — passed.
- Contracts suite — passed; 92 tests.
- Domain suite — passed; 183 tests.
- API scoped suite — passed; 156 tests; database suites skipped without integration environment.
- CLI suite — passed; 114 tests passed and 1 skipped.
- `node scripts/verify-solopreneur-gate-matrix.mjs` — passed; 105/105 mutations.
- `pnpm test:docs` — passed; 11 ADRs, 12 rule references and 28 relationship resources verified.
- `jq empty docs/api/openapi-v1.json` — passed.
- `git diff --check` — passed.
- `DATABASE_URL=...naai_erp_demo pnpm db:migrate` — passed on the populated demo database.
- Populated-database schema readback — all 15 obsolete tables absent; `expenses`,
  `commercial_documents`, `journal_entries`, `journal_lines`, `customer_receipts` and
  `project_freelance_payables` present.
- Fresh `naai_erp_erp905_fresh` database migration — passed; obsolete table count `0`, retained
  canonical table count `5` for the selected control set.
- `RUN_DB_INTEGRATION=1 DATABASE_URL=...naai_erp_erp905_test pnpm --filter @naai-erp/api exec vitest run src/project-profitability/project-profitability.integration.test.ts`
  — passed; 1 PostgreSQL integration test.
- `pnpm check` — passed after Prettier correction; all formatting, lint, typecheck, docs, security,
  fixture, native database, package-test and production-build stages completed successfully.
