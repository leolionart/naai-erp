# ERP-500 summary

- Task: ERP-500 — Timesheet and cost rates
- Rules: BR-TIM-001, BR-CST-001
- Tests: T-TIM-001, T-CST-001

ERP-500 establishes the workforce identity, weekly time, labor-cost-rate and capacity foundations required by later project economics work.

Workforce profiles link an organization-scoped employee, freelancer or contractor party to an optional authenticated user. Timesheets preserve explicit project/internal and billable/non-billable classification, support timed or allocation entries and follow the controlled lifecycle `draft → submitted → approved → locked → billed`, with `submitted → rejected → draft` for correction.

Approved time is immutable. Later corrections are append-only signed adjustments with their own submit/approve flow. Timed entries cannot overlap for the same worker, allocation and timed modes cannot be mixed on the same day, and approved labor cost uses the rate version effective on the original work date.

Labor cost rates are effective-dated, versioned and classified as gross salary, fully loaded or blended. Approved ranges cannot overlap. Approval stores a deterministic half-up cost snapshot so later rate versions never rewrite historical project cost.

Capacity versions provide configured weekly minutes and workdays. The capacity summary separates configured availability, approved time, billable time, non-billable time and remaining unallocated minutes, including approved adjustments.

Machine access uses the same versioned REST/OpenAPI contracts and first-party CLI as the admin UI. Discovery remains available through `discovery openapi` and `discovery capabilities`; no AI-specific branding or visible AI control is introduced.
