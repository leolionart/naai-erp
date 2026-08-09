# ERP-868 tests

- API suite: `pnpm --filter @naai-erp/api test` — PASS, 37 files / 143 tests; DB-gated suites skipped.
- Domain suite: `pnpm --filter @naai-erp/domain test` — PASS, 37 files / 187 tests.
- Focused web E2E: executive metrics + business mode — PASS, 7 tests.
- API, domain, web and database typechecks — PASS.
- Migration contract: `pnpm db:check` — PASS, 47 entries.
- `git diff --check` — PASS.
- Release workflow run `31317333491` — PASS; packaging plus all four image publications succeeded.
- Production Compose readback — PASS; API/web/worker healthy, migrate exited 0, all four application
  containers report OCI revision `96cd501708a4b7abb468bf8a69bf87823a37b262`.
- Production organization workflow capability — PASS; `operatingMode=solopreneur`,
  `ownerCanSelfApprove=true`, `requiresDistinctApprover=false`.
- Executive metric policy approval/readback — PASS; `naai-executive-metrics:1` is `approved`.
- Executive metric report contract — PASS; full, equity, liquidity, profitability, returns and ROI
  endpoints all returned HTTP 200 for `2026-01-01..2026-08-09` under TT133.
- Local production-backed UI — PASS; equity page rendered real values without console errors and the
  “Xem nguồn” drill-down displayed source fingerprint, formula and cutoff.

The existing fixed-ID DB integration fixture could not be rerun against the reused local database
because `org-erp640` already existed. A fresh test database could not be created by the restricted
local PostgreSQL role. The new authorization branch is therefore covered by a focused pure regression
test and the existing integration scenario remains in the suite for clean-database CI.
