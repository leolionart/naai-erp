# ERP-120 acceptance

- [x] Dimension values are organization scoped and can be activated/deactivated.
- [x] Required dimensions are effective-dated per account rule rather than globally hard-coded.
- [x] Cross-organization dimension values are rejected by domain validation.
- [x] Default category mappings pin account and tax-policy versions.
- [x] Mapping versions retain actor, reason and correlation metadata.
- [x] Percentage allocation totals exactly 100 using decimal strings.
- [x] Amount allocation totals exactly the source amount using minor units.
- [x] Rounding residual requires an explicit residual account.
- [x] Test aliases `T-DIM-001` and `T-DIM-002` are registered.
- [ ] Exact-commit PostgreSQL migration and integration tests pass on CI.
