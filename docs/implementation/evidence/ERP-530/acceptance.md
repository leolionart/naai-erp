# ERP-530 acceptance evidence

ERP-530 is ready for review but is not yet accepted as done. Local validation passed across the current backend plus uncommitted contract, CLI and UI work; exact pushed-commit CI is still required.

Acceptance coverage:

- Pass: policies are versioned, effective-dated and classified as variable or fixed overhead.
- Pass: source pools claim overhead-reserved project cost items once and preserve exact source totals.
- Pass: direct-cost and overhead allocation are mutually exclusive.
- Pass: revenue, labor-hour, headcount, fixed-percentage and manual allocation methods are supported.
- Pass: allocation uses exact integer arithmetic with deterministic residual distribution and stable tie-breaking.
- Pass: allocation splits total exactly to the allocatable source pool.
- Pass: policy and basis snapshots are persisted with each run.
- Pass: lifecycle transitions use expected resource versions, idempotency and audit reasons.
- Pass: period workflow prevents unsafe mutation across locked accounting periods.
- Pass locally: posting creates a balanced project-dimension journal in the same transaction and stores its journal ID.
- Pass locally: reversal creates a linked inverse journal, preserves dimensions and nets the allocation to zero.
- Pass locally: API, headless discovery, CLI and responsive UI flows are covered.
- Pending: commit and push the current contract, CLI and UI work, then obtain green exact-commit GitHub CI.

ERP-540 will consume posted/read-model overhead splits for profitability reporting. ERP-530 does not add a standalone project-overhead report endpoint.
