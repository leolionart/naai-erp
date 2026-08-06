# ERP-720 Acceptance

- Invoice and expense list/new/detail routes are separate pages.
- Draft edits use optimistic versioning and preserve visible API errors.
- Posted, cancelled or otherwise locked resources reject editing.
- Desktop and mobile focused routes do not overflow.
- Customers are selected by client role and link to invoices and receivables.
- Projects link to customer, project-filtered invoices, budget, costs and profitability.
- Customer and project create/edit flows use in-context drawers; detail reads use direct opaque resource keys.
- Local `/customers` and `/projects` render with HTTP 200.
