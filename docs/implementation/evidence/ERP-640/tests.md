# ERP-640 test evidence

Blocking coverage:

- `T-KPI-003`: gross, operating and net margin plus labeled ROS and signed zero-denominator policy.
- `T-KPI-004`: ROE/ROA average denominators and purpose-specific project/marketing ROI.
- `T-KPI-005`: accumulated loss, Equity Consumed, operating net burn and unrestricted-cash runway against `GF-EQUITY-001`.

Executed local checks:

```sh
node tests/fixtures/golden/GF-EQUITY-001/verify.mjs
pnpm --filter @naai-erp/domain test -- executive-metrics
pnpm --filter @naai-erp/contracts test -- executive-metrics
pnpm --filter @naai-erp/database test
pnpm --filter @naai-erp/api test
pnpm --filter @naai-erp/cli test
pnpm --filter @naai-erp/web test
pnpm check
pnpm db:check
pnpm test:fixtures
pnpm test:e2e
git diff --check
```

Local results:

- `GF-EQUITY-001`: pass for equity roll-forward, Equity Consumed, purpose-specific ROI, signed three-month burn, owner-loan exclusion and restricted-cash exclusion; all fixture hashes pass.
- Domain: 175/175 tests pass, including seven executive-metric formula/policy tests.
- Public contracts: 45/45 tests pass.
- Database: 13 tests pass and 15 PostgreSQL tests are CI-only locally; migration journal validation passes for all 33 entries.
- API non-PostgreSQL suite: 61 tests pass and 58 PostgreSQL tests are CI-only locally.
- First-party CLI: 209/209 tests pass.
- Web unit tests: 28/28 pass.
- ERP-640 targeted desktop/mobile Playwright: 4/4 pass.
- Full Playwright: 51/51 pass.
- `pnpm check`, `pnpm db:check`, `pnpm test:fixtures` and `git diff --check`: pass in the integrated worktree.

Exact-commit GitHub CI must still execute PostgreSQL migrations/integration, the full API/worker suites and all Playwright journeys before acceptance.
