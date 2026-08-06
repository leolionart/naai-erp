# GF-KPI-001

Independent exact-VND performance-comparison oracle for ERP-620.

The fixture covers:

- MTD actual versus prorated and full-period targets;
- selected recognized/invoiced/collected actual basis;
- month-over-month and year-over-year comparisons;
- forecast versus target and retained-forecast accuracy variance;
- missing comparison and zero-denominator `N/A` policy;
- leap-year and `Asia/Ho_Chi_Minh` cutoff boundaries;
- explicit calendar-month and custom fiscal-period definitions.

Files:

- `input.json`: anonymized period, basis, target, actual and forecast observations.
- `expected-comparisons.csv`: exact amount/bps/null comparison oracle.
- `expected-cutoffs.csv`: timezone, leap-day and comparable-date oracle.
- `expected-control-tie.csv`: independent structural and amount controls.
- `oracle-manual.md`: human-reviewed formulas and arithmetic.
- `verify.mjs`: fixture-local verifier that imports no production code.
- `SHA256SUMS`: immutable content manifest.

Any change to expected output requires explicit review and a documented reason.
