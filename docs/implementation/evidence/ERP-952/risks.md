# Risks and follow-ups

- Existing web test failures are unrelated to this change and must be repaired separately.
- Legacy rows that lack an explicit funding account remain outside the custody-spend deduction; they require reviewed correction/replacement before production migration.
- `CASH-COMPANY` and `CASH-OWNER-CUSTODY` historically shared ledger `111-CASH`; account-level funding metadata is required to split old movements reliably.
- Migration 0066 uses FIFO by booking date for legacy owner-paid rows. Rows without enough custody balance remain personal advances and require accountant confirmation if source documents indicate otherwise.
