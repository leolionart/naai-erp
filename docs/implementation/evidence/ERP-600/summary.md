# ERP-600 summary

- Task: ERP-600 — Targets and forecast versions
- Gate: G6 — Planning and management reporting
- Status: done

ERP-600 adds versioned monthly, quarterly and yearly revenue targets with an explicit recognized, invoiced or collected actual basis. Target identity includes organization and optional team, service-line and owner dimensions. Published revisions retain their previous version rather than rewriting it.

Forecast planning exposes independent base, best, worst and named custom scenarios. Working versions and retained month-end snapshots carry their own as-of date and selected actual basis; they do not store or overwrite actual accounting data.

The usable admin UI is available through the `Dự báo` menu at `/forecast/targets` and `/forecast/scenarios`, with dedicated version detail pages. Creation and publish actions use short dialogs, list filters use a URL-backed Sheet, and superseding a version requires a reasoned AlertDialog. No AI/copilot surface is visible.

`GF-FORECAST-001` is an independent exact-VND oracle for target version chains, all three actual bases, all four scenario kinds, immutable month-end snapshots and structural control ties.

Exact-commit PostgreSQL and Playwright CI passed for proof commit `1e84c0d2ebd6b31231128a0332eb2bf945734ce5`: https://github.com/leolionart/naai-erp/actions/runs/31056116463.
