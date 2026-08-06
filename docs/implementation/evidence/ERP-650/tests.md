# ERP-650 test evidence

Planned blocking coverage:

- `T-SNP-001`: the same canonical request, versions and ledger cutoff reproduce the same result hash; changed input or source boundary produces a new immutable snapshot version.
- `T-EXPOR-001`: CSV/XLSX exports preserve report lines, mapping status, unresolved items and audit metadata; failed readiness thresholds prevent a final label.

Evidence remains pending implementation and exact-commit CI.
