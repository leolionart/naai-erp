# ERP-620 test evidence

## Independent fixture

```sh
node tests/fixtures/golden/GF-KPI-001/verify.mjs
```

The fixture-local verifier checks its SHA256 manifest and recalculates all proration, variance, attainment, null-policy, leap-day, timezone and fiscal-period controls without importing production code.

## Local integrated checks

```sh
pnpm --filter @naai-erp/domain test
pnpm --filter @naai-erp/contracts test
pnpm --filter @naai-erp/database test
RUN_DB_INTEGRATION=1 pnpm --filter @naai-erp/api test -- performance-comparison.integration
pnpm --filter @naai-erp/cli test
pnpm --filter @naai-erp/web typecheck
pnpm --filter @naai-erp/web test
pnpm --filter @naai-erp/web exec playwright test e2e/performance-comparisons.spec.ts
pnpm check
pnpm db:check
```

Local integrated results:

- `pnpm check`: pass, including formatting, lint, typecheck, documentation/security/fixture checks, unit suites and production builds.
- `pnpm db:check`: pass for all 30 migration-journal entries including ERP-620 actual facts.
- `pnpm test:fixtures`: pass including `GF-KPI-001`.
- Domain: 161 tests pass.
- Public contracts: 40 tests pass.
- Database schema: 6 tests pass.
- API non-PostgreSQL suite: 59 tests pass.
- First-party CLI: 204 tests pass.
- Full Playwright: 41/41 pass.
- ERP-620 targeted Playwright: four tests in `apps/web/e2e/performance-comparisons.spec.ts` pass, including visible actual-vs-retained-forecast output beside forecast-vs-target, MoM and YoY.

The local suite also proves public contract exports, aggregate API/CLI routing, admin navigation, production rendering, selected-basis labels, structured `N/A` reasons, URL-backed filtering, source Drawer and responsive queue/detail pages.

## Exact PostgreSQL proof

```sh
RUN_DB_INTEGRATION=1 pnpm --filter @naai-erp/api test -- performance-comparison.integration
```

No local PostgreSQL service was available. Exact-commit CI executed the PostgreSQL cases for organization isolation, idempotent actual-fact refresh, source freshness/version checks, safe collected-dimension attribution, calendar/fiscal windows and aggregate formula readback successfully for `bb048f4d291cacaedbc32fb132665b5901b43bbd`. The same job passed the complete repository gates and 41/41 Playwright journeys: https://github.com/leolionart/naai-erp/actions/runs/31060887883.
