# ERP-640 acceptance evidence

Current acceptance coverage:

- Pass locally: gross, operating and net margin remain separate; ROS is explicitly labeled and signed nonzero revenue is the denominator. Zero revenue returns structured N/A.
- Pass locally: ROE/ROA use positive average denominators; project, marketing and custom ROI stay separate by approved definition version and included-cost policy. Missing/non-positive denominators return structured N/A.
- Pass locally: closing equity ties opening equity, contributions, withdrawals, profit/loss and reviewed adjustments; owner loans remain separately disclosed liabilities. Accumulated loss and Equity Consumed are not clamped.
- Pass locally: operating burn uses the signed average of the configured number of complete, ready calendar-month Cash Flow reports. Owner financing is excluded by the Cash Flow operating classification; runway uses unrestricted cash only and returns cash-generating/N/A when burn is not positive.
- Pass locally and in targeted PostgreSQL 16 integration: an approved policy must cover the full report period and its selected version is explicit; ROI facts must fit the approved definition's effective dates; source IDs and a deterministic organization/policy/period/dimensions fingerprint cover P&L, opening/closing Balance Sheet, monthly Cash Flow, semantic mappings and reviewed ROI facts.
- Pass locally: database tables preserve policy, semantic mapping, ROI-definition and ROI-fact versions plus maker-checker/review metadata.
- Pass locally: REST/OpenAPI/capabilities and the CLI expose all 13 executive-metric operations with exact-string-money contracts; executable tests resolve the package-local runtime in a clean pnpm workspace.
- Pass locally: the admin landing plus five dedicated report pages use URL-backed Sheet filters, source Drawer, blocking Alerts and responsive tables; targeted Playwright passes 4/4 and the full suite passes 51/51.
- Pass locally: `pnpm check`, `pnpm db:check`, `pnpm test:fixtures`, `pnpm test:e2e` and `git diff --check` pass in the integrated worktree.

Accepted in exact-commit GitHub CI for `b23d70bb8fdb4b27123cb41e1bea8e5830f9a9f2`: repository quality/build, all 33 migrations, 28/28 database tests, 119/119 API tests, 8/8 worker tests and 51/51 desktop/mobile Playwright journeys passed at https://github.com/leolionart/naai-erp/actions/runs/31069121747.
