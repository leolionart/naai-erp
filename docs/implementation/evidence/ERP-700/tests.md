# ERP-700 test evidence

Blocking coverage:

- `T-E2E-001` / `T-E2E-ERP-700-001`: executive dashboard renders exact canonical API values, preserves filters and routes every KPI to a stable drill-down or owning report.
- `T-E2E-002` / `T-E2E-ERP-700-002`: financial amount ties to drill-down rows and resolves journal, source document and authorized evidence without cross-organization leakage.

Executed local checks:

```sh
node tests/fixtures/golden/GF-DASHBOARD-001/verify.mjs
pnpm check
pnpm db:check
pnpm test:fixtures
RUN_DB_INTEGRATION=1 pnpm --filter @naai-erp/api exec vitest run src/financial-statements/financial-statement.integration.test.ts
pnpm test:e2e
git diff --check
```

Local results:

- `GF-DASHBOARD-001`: pass for canonical card values, exact row sum and typed organization-scoped source chain.
- Public contracts: 51/51 tests pass.
- API non-PostgreSQL suite: 63 tests pass. Fresh PostgreSQL 16 financial-statement integration passes 7/7, including valid second-organization 404 isolation, 300+200=500 row tie and journal/document/evidence resolution.
- First-party CLI: 224/224 tests pass, including positive-line validation and source-resolver routing.
- Web unit tests: 28/28 pass.
- Targeted dashboard/navigation Playwright: 7/7 pass.
- Full desktop/mobile Playwright: 58/58 pass.
- `pnpm check`, `pnpm db:check`, `pnpm test:fixtures` and `git diff --check`: pass locally.

Rendered localhost QA used Playwright fallback because the in-app Browser connection returned `No browser is available`. Desktop 1440×1000 and mobile 390×844 screenshots confirmed the dashboard identity, responsive card stack, visible token-required error state and absence of a framework overlay. Interaction/state transitions are covered by the 58 Playwright journeys.

Exact-commit GitHub CI results for `96e1d5116a0bd6cb39630b8a655a32106ebb4a56`:

- Repository quality/build and all golden fixtures, including `GF-DASHBOARD-001`: pass.
- Migration journal: 34 entries valid; migrations applied successfully to PostgreSQL 16.
- Database: 30/30 tests pass.
- API: 124/124 tests pass, including 7/7 financial-statement integration tests.
- Worker: 8/8 tests pass.
- Full desktop/mobile Playwright: 58/58 pass.

GitHub Actions: https://github.com/leolionart/naai-erp/actions/runs/31072817453.
