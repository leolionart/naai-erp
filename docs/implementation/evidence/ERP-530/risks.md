# ERP-530 risks and follow-up

- Exact pushed-commit CI is pending because contract, CLI and UI work remains uncommitted in the current worktree.
- The source pool and allocation run must continue to use one authoritative monetary basis; native-currency values must not be silently aggregated across currencies.
- Policy and basis snapshots are immutable report evidence. Future policy edits must create a new version instead of rewriting historical runs.
- Direct cost and overhead claims must remain mutually exclusive to prevent double counting.
- Posted or period-locked runs must be changed only through controlled reversal or a later-period replacement.
- Local unit, build and browser suites pass, but the new journal assertions require the PostgreSQL GitHub CI environment before final acceptance.
- ERP-530 deliberately has no separate `GET /reports/project-overhead` endpoint. ERP-540 owns project profitability, including before-overhead, contribution and fully loaded reporting.
- ERP-540 must preserve variable versus fixed overhead classification and expose source pool, policy, run, split and journal drill-down.
