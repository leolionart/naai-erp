# ERP-740 Tests

- Compose contract passed.
- Four local images built non-root; persistence sentinel survived stack recreation.
- Release workflow verifier and `actionlint` passed.
- CLI tests: 228/228 passed.
- Real workbook extraction test: 1/1 passed.
- Workbook PostgreSQL integrations: 7/7 passed.
- Detail totals: sales `195261583`, expense net VAT `443293388`, profit `-248031805`.
- Control-sheet variances are exposed and block an unclassified commit.

Exact-commit release and CI proof remain pending until the workflow is pushed and its images are verified.
