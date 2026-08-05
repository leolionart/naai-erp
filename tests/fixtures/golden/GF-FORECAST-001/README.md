# GF-FORECAST-001

Independent exact-VND planning fixture for ERP-600. It covers monthly, quarterly and yearly revenue targets; recognized, invoiced and collected actual bases; sequential target versions; base, best, worst and custom scenarios; and retained month-end forecast snapshots.

Files:

- `input.json`: reviewed source facts and identities.
- `expected-target-versions.csv`: exact target version oracle.
- `expected-scenarios.csv`: scenario and snapshot oracle.
- `expected-control-tie.csv`: structural and exact-money controls.
- `oracle-manual.md`: independent calculation/review notes.
- `verify.mjs`: fixture-local verifier that does not import production code.
- `SHA256SUMS`: immutable content manifest.

Any output change requires explicit review and a documented reason.
