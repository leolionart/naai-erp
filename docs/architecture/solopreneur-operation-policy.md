# Solopreneur operation policy

See the [overall business workflow guide](../product/business-workflows.md) for how this policy
changes the day-to-day user flow. This document remains authoritative for the safeguard boundary
between `solopreneur` and `controlled` operation modes.

ERP-900 inventories every OpenAPI `POST`, `PATCH` and `DELETE` operation in
`docs/implementation/solopreneur-gate-matrix.json`. The generated matrix is the machine-readable
baseline for ERP-901 through ERP-904; it does not change runtime behavior.

## Classification boundary

- `none`: master data or operational effects with no draft or posted accounting mutation.
- `draft`: creates or changes a draft, proposal, review fact, configuration or import plan.
- `posted`: creates or settles an accounting effect.
- `correction`: reverses, unmatches, unreconciles, supersedes or replaces retained history.
- `destructive`: deletes operational data or resets/restores organization data.

`posted`, `correction` and `destructive` actions remain explicit. Solopreneur mode may compress
eligible `none` and `draft` steps for an authenticated owner, but never removes organization scope,
RBAC, audit, idempotency, optimistic concurrency or relationship validation.

## Reviewed UI action families

| Family                     | Desired solopreneur behavior                                    | Safeguards retained                                        |
| -------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| Expense                    | One policy-aware “Ghi nhận & post” action after complete inputs | balance, period, tax/evidence, idempotency, immutable post |
| Sales/purchase documents   | Collapse routine validate/approve; keep issue/post explicit     | issued history, period, tax and accounting gates           |
| Timesheets/adjustments     | Readable selectors, server reason, one-click routine approval   | billed/locked protection and adjustment history            |
| Direct cost/overhead       | Business selectors and one policy-aware allocation action       | exact totals, no double count, posted correction           |
| Planning/forecast          | Auto-carry versions, optional note, one-click publish           | concurrency and retained versions                          |
| Forecast components        | Source lookup and one-click routine review                      | linked-source validation and delete confirmation           |
| Cost rates                 | Worker selector and create-and-approve                          | date overlap and historical-use protection                 |
| Subscriptions              | Server audit reason and one-click lifecycle                     | date/reference validation and audit                        |
| Banking/internal transfers | Account/transaction selectors; optional routine note            | eligibility, reconciliation lock, balanced posting         |
| Reconciliation             | Better selectors only; overrides/unmatch/reopen stay explicit   | allocation limits, locks, reasons and reversal             |

Protocol fields such as raw IDs, resource versions and idempotency keys remain in REST/CLI contracts.
The first-party UI should carry them automatically and show readable names; technical identifiers
remain available in advanced audit and drill-down views.

Controlled mode remains unchanged.
