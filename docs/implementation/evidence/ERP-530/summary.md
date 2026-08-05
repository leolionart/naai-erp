# ERP-530 summary

- Task: ERP-530 — Overhead allocation
- Gate: G5 — Project economics
- Status: review

ERP-530 implements versioned overhead allocation policies, controlled source pools and deterministic allocation runs. Supported allocation methods are revenue, labor hours, headcount, fixed percentage and manual splits. Policies retain effective dates and variable/fixed cost classification; runs snapshot their policy and allocation basis so later policy changes cannot rewrite reviewed history.

Backend implementation commits:

- `8094790de948c39eca9e287cf112f652f171e2f2` — overhead allocation engine, persistence and API lifecycle;
- `b93fb80193772714b100be801a0f1173e8a5cc72` — persist allocation basis and policy snapshots as JSON;
- `602d9f8ce8b96acb21f5f414ccbb9c9acbd9b2e5` — persisted resource-version and fiscal-period workflow proof.

The current worktree additionally contains uncommitted contract, CLI and UI coverage for policy, source-pool and allocation-run discovery and operation. ERP-530 remains in review until that work is committed, pushed and verified by exact-commit CI.

Posting an approved run now creates one balanced base-currency journal atomically. Source expense accounts are reclassified from an unassigned control line to project-dimension debit lines using the immutable run splits. Reversal creates a linked inverse journal, preserves dimensions, nets the original effect to zero and exposes both journal identifiers for drill-down.

Project profitability is intentionally outside ERP-530. There is no separate `GET /reports/project-overhead` endpoint; ERP-540 owns the combined before-overhead, contribution and fully loaded profitability report.
