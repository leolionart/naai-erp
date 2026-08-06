# ERP-620 summary

- Task: ERP-620 — Performance comparisons
- Gate: G6 — Planning and management reporting
- Status: done; exact-commit CI passed

ERP-620 compares the selected recognized, invoiced or collected actual basis with prorated/full targets, prior periods, prior-year periods and retained forecast snapshots. Each result labels its period definition, comparator kind, formula version and denominator rather than presenting unlike comparisons as interchangeable percentages.

MTD target proration uses inclusive local calendar days in the organization's timezone. Calendar and custom fiscal periods carry explicit start/end dates and predecessor IDs. Leap-day prior-year comparison clamps to the last valid comparable day instead of rolling into March.

Missing comparison data returns `N/A` with a structured reason and null amount/percentage outputs. A real zero comparator preserves the valid amount difference but returns null percentage fields with `zero_denominator`; neither case is displayed as `0%`.

`GF-KPI-001` is the independent exact-VND oracle for MTD target attainment, MoM, YoY, forecast variance, null/zero denominator behavior, leap-year/Asia-Ho-Chi-Minh cutoffs and fiscal periods.

The usable admin UI is available at `/reports/performance` with a dedicated period route, URL-backed filters, actual/prorated/full-target KPI cards, MoM/YoY, actual-vs-retained-forecast and forecast-vs-target comparison table, explicit selected basis and source Drawer. Structured missing/zero reasons render as clear `N/A` explanations rather than `0%`.

The integrated worktree passes repository quality/build checks, all 30 migration-journal entries, all golden fixtures including `GF-KPI-001`, and 41/41 desktop/mobile Playwright journeys. Exact-commit CI passed for implementation/proof commit `bb048f4d291cacaedbc32fb132665b5901b43bbd`, including PostgreSQL migration/integration and 41 Playwright journeys: https://github.com/leolionart/naai-erp/actions/runs/31060887883.
