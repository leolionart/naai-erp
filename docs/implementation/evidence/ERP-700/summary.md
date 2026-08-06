# ERP-700 summary

- Task: ERP-700 — Dashboards and drill-down
- Gate: G7 — Experience and operations
- Status: implemented locally; exact-commit CI pending

ERP-700 replaces the static module launcher with an executive dashboard that reads canonical executive metrics, performance comparison, project profitability and AR-aging APIs in parallel. KPI cards display backend values, formula versions, statuses and source boundaries; the browser does not recalculate financial totals.

The dashboard uses URL-backed period/dimension filters, a confidence Alert, semantic KPI links, a dynamically loaded trend chart, a quick source Drawer and dedicated metric drill-down and finance-review routes. Review rows return to the owning module instead of embedding every workflow in one page.

Financial statement drill-down now exposes typed organization-scoped source references from report row to journal line, journal entry, commercial document or expense and authorized active evidence. The source resolver and first-party CLI expose the same chain through documented REST/OpenAPI contracts.

`GF-DASHBOARD-001` independently proves dashboard-to-report value identity, exact drill-down summation and the typed source chain. The integrated local worktree passes the fresh PostgreSQL financial-statement suite 7/7 and full desktop/mobile Playwright 58/58.
