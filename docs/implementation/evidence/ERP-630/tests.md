# ERP-630 test evidence

Planned independent fixture checks:

```sh
node tests/fixtures/golden/GF-FINANCIAL-001/verify.mjs
node tests/fixtures/golden/GF-VAT-001/verify.mjs
```

Planned integrated checks:

```sh
pnpm --filter @naai-erp/domain test
pnpm --filter @naai-erp/contracts test
pnpm --filter @naai-erp/database test
RUN_DB_INTEGRATION=1 pnpm --filter @naai-erp/api test -- financial-statements.integration
pnpm --filter @naai-erp/cli test
pnpm --filter @naai-erp/web typecheck
pnpm --filter @naai-erp/web test
pnpm --filter @naai-erp/web exec playwright test e2e/financial-statements.spec.ts
pnpm check
pnpm db:check
pnpm test:fixtures
pnpm test:e2e
```

Local integrated results:

- `pnpm check`: pass, including formatting, lint, typecheck, documentation/security/fixture checks, unit suites and production builds.
- `pnpm db:check`: pass for all 32 migration-journal entries, including versioned statement mappings and VAT readiness policy.
- `pnpm test:fixtures`: pass, including `GF-FINANCIAL-001` and `GF-VAT-001` with SHA manifests and fixture-local verifiers.
- Domain: 168 tests pass.
- Public contracts: 42 tests pass.
- Database: 8 tests pass; PostgreSQL-specific tests remain CI-only locally.
- API non-PostgreSQL suite: 59 tests pass.
- First-party CLI: 205 tests pass.
- ERP-630 targeted Playwright: 6/6 pass.
- Full Playwright: 47/47 pass. One existing internal-transfer assertion was made deterministic with `expect.poll` after the full suite exposed its immediate-request race.

No local PostgreSQL service was available. Exact-commit CI must execute `financial-statement.integration.test.ts`, including mapping replay/versioning/org isolation, canonical P&L, Balance Sheet mismatch rejection, direct Cash Flow classification/tie-out, VAT/credit-note/readiness controls, tax exceptions, drill-down and cutoff stability before ERP-630 is marked done.
