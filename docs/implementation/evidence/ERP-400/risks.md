# ERP-400 risks and follow-ups

- Local PostgreSQL and Docker were unavailable, so database integration tests are not claimed locally. Exact-commit GitHub CI with `RUN_DB_INTEGRATION=1` must pass before ERP-400 can be marked done.
- ERP-400 does not calculate bank book balances or create settlement journals. Those effects require ERP-410 reconciliation and must remain tied to posted ledger/payment allocations.
- Internal transfers and fee/FX split handling are owned by ERP-420 and ERP-410.
- The generic CSV adapter expects exact minor-unit integers and ISO dates. Bank-specific locale/decimal adapters should be added as new versioned adapters, never by silently changing generic-csv v1.
- CSV formula-risk cells are preserved as immutable raw literals and routed to `needs_review`; export-time formula neutralization remains an export-layer responsibility.
