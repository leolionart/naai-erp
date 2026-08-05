# ERP-540 risks and follow-up

- Backend/domain/contracts/CLI work is being integrated in parallel; response-field alignment must be rechecked before commit.
- Project profitability must include only posted or otherwise policy-approved read-model facts at the requested as-of boundary.
- Direct project cost and overhead must remain mutually exclusive to prevent double counting.
- Variable and fixed overhead classification must survive source-pool, policy, run and journal drill-down.
- Percentage and hourly-rate totals must be recalculated from aggregate numerators and denominators rather than summing project ratios.
- Utilization must use approved billable capacity, not all project minutes or all employee time.
- Zero-revenue and zero-capacity denominator behavior needs explicit backend coverage; UI formatting must not imply a valid percentage when the basis is null.
- Missing dimensions, unbilled work, overdue AR and overrun are confidence signals, not silent exclusions from the report.
- Historical cost-rate and overhead-policy versions must not be rewritten when later versions become effective.
- Exact-commit GitHub CI passed. Remaining risks are operational data quality concerns surfaced by the report rather than acceptance blockers.
