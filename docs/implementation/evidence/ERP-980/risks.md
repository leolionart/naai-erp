# ERP-980 Risks, Safeguards & Follow-ups

## Remaining Risks & Operational Safeguards

1. **Historical `111-CASH` Entries Prior to Migration Commit**:
   - Migration `0076` updates `CASH-OWNER-CUSTODY.ledger_account_code` to `111-OWNER-CUSTODY` so all new postings land on `111-OWNER-CUSTODY`, while preserving immutability of already-posted `journal_lines` on `111-CASH`.
   - Until an administrator runs `POST /api/v1/organizations/:organizationId/funding-plans/owner-custody-migration/dry-run` followed by `commit`, historical custody entries remain on `111-CASH` (preserving total `111` cash) and `GET /reports/operating-dashboard` surfaces `configurationWarnings: ["owner_custody_ledger_migration_required"]`.
2. **Closed Fiscal Periods**:
   - `owner-custody-migration/commit` respects hard-locked periods (`409 PERIOD_HARD_LOCKED`). When historical custody transactions sit in a locked period, callers can pass `effectiveOn` in the current open period to post the balanced reclassification journal (`Dr 111-OWNER-CUSTODY / Cr 111-CASH` and `Dr 111-CASH / Cr 111-OWNER-CUSTODY`) without mutating closed periods.
3. **Portable Data Packages Compatibility**:
   - Reclassification provenance (`ownerCustodyMigrationSourceKey`) is stored in `journal_lines.dimensions` rather than introducing a new table, preserving 100% schema compatibility with `portable-data-packages` export/restore.
