# GF-PROJECT-001

Immutable project-profitability oracle for Gate G5.

The fixture covers milestone-recognized service revenue, effective-dated labor cost, freelancer direct cost, variable overhead, fixed overhead and their reviewed profitability layers. It proves:

- gross margin, contribution margin and fully loaded profit remain distinct;
- cash collected is disclosed but never substituted for recognized revenue or profit;
- realized hourly rate, utilization and cost overrun use explicit denominators;
- unbilled work, overdue AR and overrun appear as confidence flags;
- project totals tie exactly to ledger/read-model dimensions;
- historical cost-rate and allocation-policy version references are preserved.

Artifacts:

- `input.json`: independent source facts and ledger controls.
- `expected-project-margin.csv`: manually reviewed project and total outputs.
- `expected-control-tie.csv`: exact report-to-ledger controls.
- `oracle-manual.md`: formulas and review decisions.
- `verify.mjs`: fixture-local exact arithmetic and integrity verifier.
- `SHA256SUMS`: immutable hashes for all reviewed source and expected artifacts.
