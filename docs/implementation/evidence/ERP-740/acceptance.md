# ERP-740 Acceptance

- Four non-root images build successfully.
- Compose becomes healthy and preserves PostgreSQL data across restart.
- Main release publishes `main` and immutable `sha-<12>` tags with exact OCI revision.
- Import dry-run performs zero mutations and inventories all 14 workbook sheets.
- Commit is transactionally idempotent and organization-scoped.
- Calendar-year accounting totals remain separate from the static legacy mixed-year control.
- Mapping v2 requires auditable per-row treatment and blocks missing/unaudited exclusions; aggregate variance waivers are v1-only.
- Reviewed sales-project mappings are explicit; unmatched customer/project relationships remain warnings rather than guesses.
