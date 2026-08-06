# ERP-740 Tests

- Compose contract passed.
- Four local images built non-root; persistence sentinel survived stack recreation.
- Release workflow verifier and `actionlint` passed.
- CLI tests: 228/228 passed.
- Real workbook extraction test: 1/1 passed.
- Workbook PostgreSQL integrations: 9/9 passed.
- Detail totals: sales `195261583`, expense net VAT `443293388`, profit `-248031805`.
- Mapping-v2 legacy totals: sales `244717833`, expense `298148067`, profit `-53430234`.
- Real workbook mapping-v2 dry-run: valid, zero errors and zero unexplained control variances.
- Calendar totals and legacy control totals are both exposed; every legacy component retains sheet, row, period, classification and evidence.

Exact-commit release and CI proof remain pending until the workflow is pushed and its images are verified.
