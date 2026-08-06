# ERP-620 acceptance evidence

Current acceptance coverage:

- Pass locally: selected actual basis remains explicit and recognized/invoiced/collected observations are not mixed.
- Pass locally: February 2024 target 290,000,000 prorates to 150,000,000 at local February 15; actual 120,000,000 attains 8,000 bps of prorated target and 4,138 bps of full target.
- Pass locally: MoM 120,000,000 vs 100,000,000 returns +20,000,000 and +2,000 bps.
- Pass locally: YoY 120,000,000 vs 80,000,000 returns +40,000,000 and +5,000 bps.
- Pass locally: forecast 270,000,000 vs target 290,000,000 returns −20,000,000 and −690 bps.
- Pass locally: actual 300,000,000 vs retained forecast 280,000,000 returns +20,000,000 and +714 bps.
- Pass locally: missing comparison returns null comparison/variance/percentage fields and a structured `denominator_missing:*` reason, never zero.
- Pass locally: zero comparator retains amount variance but returns null percentages and `comparison_denominator_zero`.
- Pass locally: `2024-02-29T16:59:59Z` remains local February 29 while one second later belongs to local March 1.
- Pass locally: leap-day YoY comparable date clamps to February 28 in a non-leap prior year.
- Pass locally: custom fiscal period 2024-01-26 through 2024-02-25 has 21/31 elapsed days at February 15 and prorates 310,000,000 to 210,000,000.
- Pass locally: versioned REST/OpenAPI/capabilities and first-party CLI expose aggregate comparison readback and actual-fact refresh with exact money strings, bps/null policy, dimensions and source IDs.
- Pass locally: reachable performance menu, queue and dedicated period route display selected basis, MoM, YoY, actual-vs-retained-forecast, forecast-vs-target and explicit Vietnamese `N/A` reasons with URL-backed filters and source Drawer.
- Pass locally: full Playwright passes 41/41; `performance-comparisons.spec.ts` passes four desktop/mobile actual-vs-target, filter/navigation, source Drawer and overflow journeys.
- Pass locally: collected facts inherit dimensions only when every allocation on the settled invoice shares one identical dimension set; mixed-dimension invoices remain unclassified instead of being guessed into a filtered result.
- Pass locally: reports reject stale actual-fact materializations and per-row readback requires the source to remain in an eligible state at the captured version.

Exact-commit PostgreSQL integration and complete GitHub quality-job evidence must pass before ERP-620 is marked done.
