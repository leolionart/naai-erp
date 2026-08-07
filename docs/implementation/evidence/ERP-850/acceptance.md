# ERP-850 Acceptance

- [x] Every live organization-scoped table is included or explicitly classified in the manifest.
- [x] XLSX preserves exact values, stable identities, versions and relationships.
- [x] Unchanged export/import is a zero-mutation no-op.
- [x] Dry-run reports row-level diffs and errors before commit.
- [x] Commit is authorized, audited, version-checked and retry-idempotent.
- [x] Posted/issued history is immutable and cannot be overwritten by the package importer.
- [ ] Add canonical correction adapters for every non-master-data resource that should support
  `cancel` or `reverse_replace`; these resources are currently exported read-only.
- [ ] Financial and operational controls reconcile after import.
