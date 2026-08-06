# ERP-740 Acceptance

- Four non-root images build successfully.
- Compose becomes healthy and preserves PostgreSQL data across restart.
- Main release publishes `main` and immutable `sha-<12>` tags with exact OCI revision.
- Import dry-run performs zero mutations and inventories all 14 workbook sheets.
- Commit is transactionally idempotent and organization-scoped.
- Unexplained cross-sheet variance blocks commit; explicit versioned classification is required.
