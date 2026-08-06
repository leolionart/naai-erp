# ERP-720 Acceptance

- The narrowed menu retains Customers, Projects, Invoices, Non-invoice Expenses, AR, AP and Reports.
- Invoice and expense list/new/detail routes are separate pages.
- Draft edits use optimistic versioning and preserve visible API errors.
- Posted, cancelled or otherwise locked resources reject editing.
- Desktop and mobile focused routes do not overflow.
- Customers are selected by client role and link to invoices and receivables.
- Projects link to customer, project-filtered invoices, budget, costs and profitability.
- Customer and project create/edit flows use in-context drawers; detail reads use direct opaque resource keys.
- Local `/customers` and `/projects` render with HTTP 200.
- Protected MVP pages wait for development credential hydration and do not emit a transient initial `401`.
- The `naai` tenant hydrates its local development credential automatically without exposing it in the UI.
- Native web-to-API requests pass the explicit CORS policy.
- Real imported data is usable in the UI: 14 customers, 29 projects, 41 invoices and 200 non-invoice expenses.
- VIOD customer/project drill-down reaches AR of `81,585,000` VND.
- Invoice dates render and read back as stable `YYYY-MM-DD` values.
- Full Playwright acceptance passed 67/67 tests.
- Final SHA and exact-commit CI verification are pending.
