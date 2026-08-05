# ERP-110 acceptance

- [x] Root account types are Asset, Liability, Equity, Revenue and Expense.
- [x] Account code uniqueness is organization scoped.
- [x] Parent relationships require the same organization and root type.
- [x] Control accounts block ordinary manual posting by default.
- [x] Accounts with ledger history cannot change root type and can be deactivated.
- [x] TT133 and TT200 mappings are effective-dated and preserve historical configuration.
- [x] Missing mapping remains a statutory-readiness concern rather than a management-posting constraint.
- [x] Tax policy versions store exact rate, classification, evidence, effective dates and accountant-review state.
- [x] Half-open effective dates resolve boundary dates and overlapping versions are rejected by domain validation.
- [x] Test aliases `T-COA-001`, `T-COA-002` and `T-TAX-001` are registered.
- [x] Native Web/API preview works without Docker image builds.
- [x] PostgreSQL migration and integration suite pass on the exact pushed commit.

ERP-110 is complete. ERP-120 is now ready; Gate G1 remains in progress.
