# ERP-907 tests

## Completed during implementation

### Reporting slice

```text
pnpm --filter @naai-erp/api typecheck
```

Result: passed.

```text
pnpm --filter @naai-erp/api exec vitest run \
  src/financial-statements/financial-statement.integration.test.ts \
  src/operating-dashboard/operating-dashboard.integration.test.ts \
  src/operating-dashboard/operating-dashboard.service.test.ts
```

Result: 1 test file passed, 2 database integration files skipped because DB integration was not
enabled; 3 tests passed and 10 tests skipped. The skipped integration assertions must not be treated
as executed database proof.

```text
git diff --check -- apps/api/src/financial-statements apps/api/src/operating-dashboard
```

Result: passed.

## Added regression coverage

- Solopreneur financial statements use the latest effective draft mapping when no approved mapping
  exists and return `financial_statement_mapping_unapproved`.
- Controlled mode still rejects reporting when no approved mapping exists.
- Solopreneur dashboard owner-current and posted-ledger totals remain available with local warnings
  for unapproved or missing configuration.
- Commercial-document and expense integration suites contain atomic save-and-record owner cases.
- Performance-comparison integration coverage verifies newly posted canonical facts are readable
  without a copied-fact refresh.
- UI policy tests cover **Lưu và ghi nhận** versus **Lưu bản nháp** capability selection.

## Coordinator gates

```text
pnpm db:check
pnpm db:migrate
pnpm db:native-status
```

Result: passed. Migration directory is valid, the local upgrade completed, migration state is
54/54, and `to_regclass('public.planning_actual_facts')` is null.

```text
createdb naai_erp_erp907_test
DATABASE_URL=postgres:///naai_erp_erp907_test pnpm db:migrate
RUN_DB_INTEGRATION=1 DATABASE_URL=postgres:///naai_erp_erp907_test \
  pnpm --filter @naai-erp/api exec vitest run <ERP-907 integration suites>
```

Result: fresh migration passed. Commercial documents, expenses, performance comparison, financial
statements and operating dashboard integration coverage passed after fixing a duplicate dashboard
CTE; 33/33 relevant integration assertions passed across the isolated reruns.

```text
pnpm --filter @naai-erp/api test
pnpm --filter @naai-erp/api typecheck
pnpm --filter @naai-erp/cli test
pnpm --filter @naai-erp/database test
pnpm typecheck
pnpm test:docs
pnpm test:security-baseline
pnpm test:fixtures
pnpm test:native-db
pnpm build
```

Result: passed. API 161 passed, CLI 114 passed with 1 skipped, database 18 passed with 20 skipped,
all 10 package typechecks passed, documentation/security/fixture/native-database gates passed, and
all 10 package builds passed.

```text
pnpm check
```

Result: passed after the concurrent banking workspace was reconciled. Formatting, lint, all package
typechecks, documentation/security/fixture/native-database checks, all package tests and all package
builds completed successfully. Web tests passed 66/66, including banking 5/5 and the ERP-907 UI
policy test 1/1.

Rendered UI acceptance was explicitly confirmed by the product owner on 2026-08-11; further manual
UI testing was skipped at the owner's request. Before that instruction, localhost verification had
already confirmed the banking page rendered real ledger balances and reloaded data with zero console
errors.
