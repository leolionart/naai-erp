# ERP-850 Acceptance

- [x] Every live organization-scoped table is included or explicitly classified in the manifest.
- [x] XLSX preserves exact values, stable identities, versions and relationships.
- [x] Unchanged export/import is a zero-mutation no-op.
- [x] Dry-run reports row-level diffs and errors before commit.
- [x] Commit is authorized, audited, version-checked and retry-idempotent.
- [x] Posted/issued history is immutable and cannot be overwritten by the package importer.
- [x] Commercial documents and expenses support canonical create, draft update, cancel and atomic
      `reverse_replace`; journal history and child/audit resources remain explicitly read-only.
- [x] Financial and operational controls reconcile after import.

Live acceptance on organization `naai`, cutoff `2026-08-07`:

- Self-contained export `e23bf440-727f-42b5-9510-89cd3fae6b49`: 106 included sheets, 4 explicit
  exclusions and 714 rows; downloaded SHA-256
  `9c1303c19a087ada002ac3122996ca738279bb72db54f46a89638c1d385436a9`.
- Unchanged import `1cbe6278-e60c-4936-94c5-20cf4c901ff6`: 714 unchanged rows, zero mutations,
  explicit commit succeeded.
- Edited import `3730c66e-332e-4598-9c76-508ba394aee0`: one party create was reported `ready`,
  committed once and read back through the canonical master-data API.
- Journal, commercial-document, expense, bank-transaction and payment-reconciliation sheet hashes
  remained identical before and after the non-financial edited import.
