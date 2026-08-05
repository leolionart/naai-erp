# ERP-500 acceptance evidence

## BR-TIM-001 — Timesheet lifecycle and integrity

Implemented in the domain and machine contracts.

- Timesheet states are `draft`, `submitted`, `approved`, `rejected`, `locked` and `billed`.
- Invalid state transitions fail explicitly.
- Project/internal and billable/non-billable classifications are independent and required.
- Project time requires a project; internal time cannot silently carry a project; only project time may be billable.
- Timed entries require exact start/end/minute agreement and cannot overlap.
- Timed and allocation modes cannot be mixed for the same worker/day.
- Approved, locked and billed sheets have no edit operation. Corrections use append-only signed adjustment records.
- Adjustment approval preserves the original entry and cannot make effective approved time negative.
- Submitter/approver segregation is enforced unless an explicit server policy authorizes self-approval.

## BR-CST-001 — Effective labor cost rate

Implemented in the domain and exact-string contracts.

- Labor cost resolves exactly one approved rate using organization, worker and work date.
- Missing and ambiguous effective rates fail approval.
- Approved rate date ranges cannot overlap for a worker.
- Draft and retired rates are not selected.
- Cost uses deterministic `round_half_up(minutes × rateMinorPerHour / 60)`.
- Approval snapshots the rate version, currency, calculation version, rounding policy and cost amount.
- New rate versions do not recalculate approved historical time.
- Adjustment cost uses the original work date and an effective approved rate snapshot.
- Public timesheet cost readback omits the raw hourly rate. Raw labor-rate endpoints remain sensitive and require dedicated authorization.

## Capacity and utilization foundation

Effective-dated capacity versions validate positive integer weekly minutes and ISO workdays. Summary output distinguishes:

- configured available minutes;
- effective approved minutes, including approved adjustments;
- billable and non-billable minutes;
- remaining unallocated minutes.

## Headless and UI parity

The canonical machine resource families are:

```text
/api/v1/organizations/{organizationId}/time/workers
/api/v1/organizations/{organizationId}/time/timesheets
/api/v1/organizations/{organizationId}/time/cost-rates
/api/v1/organizations/{organizationId}/time/capacity-versions
/api/v1/organizations/{organizationId}/time/capacity-summary
```

CLI routes use those application services and never access PostgreSQL directly. Exact-string financial amounts, optimistic resource versions, idempotency keys, organization authorization and audit metadata remain part of the API contract. The UI must consume the same contracts without exposing AI-specific navigation or controls.

Database/API integration, responsive E2E and exact-commit CI remain required before the task may be marked done.
