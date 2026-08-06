# ERP-700 risks and follow-up

- Executive/performance source IDs do not yet carry journal ID plus line number, so those metric drill-down pages link to canonical reports and preserve source IDs/fingerprint rather than fabricating resolver URLs.
- The finance-review queue currently composes bounded exceptions from canonical report responses in the UI. A server-owned paged queue may be warranted when volume or stable cross-module severity ordering becomes material, but must not recalculate financial amounts.
- Dashboard access requires the existing organization-scoped API token. Missing credentials produce an explicit N/A/error state rather than demo success.
- Chart points use canonical comparison values for visualization only; all authoritative KPI values remain the exact API strings/status/formula versions.
- Source resolver hrefs point to REST resources. Dedicated journal/document/expense/evidence detail UI routes can deepen the human drill-down in later G7 tasks without changing the typed source contract.
- Exact-commit PostgreSQL and Playwright proof is green for `96e1d5116a0bd6cb39630b8a655a32106ebb4a56` at https://github.com/leolionart/naai-erp/actions/runs/31072817453; no ERP-700 acceptance boundary remains open.
