# Manual oracle review — GF-FORECAST-001

This fixture is maintained independently from production planning code. All amounts are exact VND minor units.

## Target versions

- August recognized-revenue target v1 = 100,000,000.
- August recognized-revenue target v2 = 120,000,000 and references v1; v1 remains retained as superseded.
- Q3 invoiced-revenue target = 330,000,000.
- FY2026 collected-revenue target = 1,200,000,000.
- Only the latest published version in each period/dimension/basis series is used for current target control totals.

The fixture intentionally carries actual controls of recognized 85,000,000, invoiced 90,000,000 and collected 70,000,000. They are separate observations and are never overwritten by target or forecast records.

## Scenario and snapshot review

- Base, best and worst each retain an independently addressable 2026-08-31 month-end snapshot.
- The custom `Founder stretch` scenario is a separate working draft with collected actual basis.
- A month-end snapshot is immutable: its row and source hash remain retained; corrections require a new version, never editing the reviewed row.
- Scenarios contain planning identity only in ERP-600. Revenue/expense composition belongs to ERP-610 and is intentionally excluded from this oracle.

The CSV files were manually transcribed from these reviewed expectations. `verify.mjs` recalculates structural controls without importing application packages.
