# ERP-540 summary

- Task: ERP-540 — Project profitability
- Gate: G5 — Project economics
- Status: review

ERP-540 is being implemented as a management-reporting read model with three intentionally separate profitability layers:

- gross margin = recognized project revenue − direct project cost;
- contribution margin = gross margin − attributable variable overhead;
- fully loaded profit = contribution margin − allocated fixed overhead.

The current worktree contains a responsive report queue at `/reports/project-profitability`, a dedicated project drill-down at `/reports/project-profitability/projects/[projectId]`, URL-backed filter context, KPI cards, confidence alerts and source breakdowns for revenue, direct cost and overhead. The UI does not expose an AI/copilot surface; machine discovery remains a backend OpenAPI/capability concern.

`GF-PROJECT-001` provides the independent exact-VND oracle for milestone revenue, versioned labor cost, freelancer cost, variable/fixed overhead, realized hourly rate, approved billable-capacity utilization, cost overrun and ledger/read-model ties.

Backend, domain, public contracts, OpenAPI/capabilities and first-party CLI are now integrated with the UI. ERP-540 remains in review until the changes are committed, pushed and exact-commit GitHub CI executes the PostgreSQL fixture successfully.
