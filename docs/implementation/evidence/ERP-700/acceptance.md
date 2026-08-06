# ERP-700 acceptance evidence

Current acceptance coverage:

- Pass locally: dashboard KPI values and formulas are read directly from canonical report responses; the UI only formats exact money, ratio and duration fields for display.
- Pass locally: dashboard requests execute independently in parallel and non-chart content renders before the dynamically imported trend chart.
- Pass locally: period/dimension filters persist in the URL and are forwarded to canonical report/detail routes.
- Pass locally: every KPI is a semantic link to a dedicated drill-down or owning report; quick source inspection uses a Drawer and finance exceptions use a dedicated queue page.
- Pass locally: financial statement drill-down amounts retain the API formula/sign and add typed refs for journal line, journal entry, commercial document/expense and authorized active evidence.
- Pass locally: the source resolver is organization-scoped, validates a positive line number, returns exact not-found for a valid credential from another organization and never exposes evidence outside evidence-read roles.
- Pass locally: OpenAPI provides stable operation IDs and response schemas for the dashboard-used report/drill-down endpoints; CLI reaches the source resolver without a separate UI-only formula.
- Pass locally: mobile dashboard/review routes avoid document overflow; loading, token-required error, confidence and empty trend states remain explicit.
- Pass locally: `pnpm check`, fresh PostgreSQL integration, `pnpm test:e2e` and `git diff --check` pass.

Accepted in exact-commit GitHub CI for `96e1d5116a0bd6cb39630b8a655a32106ebb4a56`: repository quality/build, all 34 migrations, 30/30 database tests, 124/124 API tests, 8/8 worker tests and 58/58 desktop/mobile Playwright journeys passed at https://github.com/leolionart/naai-erp/actions/runs/31072817453.
