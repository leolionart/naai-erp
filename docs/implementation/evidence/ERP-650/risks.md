# ERP-650 risks and follow-up

- Snapshots are retained evidence, not a second mutable ledger. Posted journals and approved report mappings/formulas remain the source of truth.
- Canonical result hashes prove financial reproducibility; XLSX file hashes may differ if generator metadata is not normalized and therefore require deterministic workbook properties.
- CSV/XLSX must not hide unmapped accounts, unresolved review items or readiness failures.
- Binary downloads require organization-scoped authorization and audit without exposing object-storage internals.
