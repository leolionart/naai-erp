# Risks and follow-ups

- Existing web test failures are unrelated to this change and must be repaired separately.
- Legacy rows that lack an explicit funding account remain outside the custody-spend deduction; they require reviewed correction/replacement before production migration.
- `CASH-COMPANY` and `CASH-OWNER-CUSTODY` historically shared ledger `111-CASH`; account-level funding metadata is required to split old movements reliably.
- Migration 0066 deliberately does not backfill ambiguous historical rows. Funding must be entered explicitly from the expense record/source evidence.
