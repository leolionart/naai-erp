# ERP-984 Risks

- Unlinked manual journal entries posted directly to `331` without an AP source document intentionally surface `tieStatus: "out_of_balance"` (`CONTROL_ACCOUNT_OUT_OF_BALANCE`) so discrepancies between ledger `331` and subledger documents are never hidden.
- Read-only query changes in `PgAgingStore`; no database schema migration is required.
