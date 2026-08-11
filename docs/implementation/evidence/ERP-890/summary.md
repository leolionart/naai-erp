# ERP-890 summary

Implemented project freelance payables as a projection of canonical posted expenses, never as a
parallel cost source. Freelancer project budgets remain forecast-only. AP aging now lists only unpaid
actual freelance liabilities. Ordinary purchase invoices become paid only with an explicit active
same-currency financial-account funding source that is credited directly during posting.

Primary files delivered:

- `packages/domain/src/project-freelance-payables.ts` and contract/domain tests.
- `db/migrations/0049_project_freelance_payables.sql` and
  `db/migrations/0050_purchase_invoice_funding.sql` with schema registration.
- `apps/api/src/expenses/` integration that creates one expense-linked payable at posting.
- `apps/api/src/project-freelance-payables/` list, detail, payment and PostgreSQL integration.
- Commercial-document funding-source persistence/posting and its PostgreSQL regression assertions.
- AP aging domain/contract/store changes, first-party CLI methods and OpenAPI.
- `apps/web/src/app/workspaces/project-freelance-payables-workspace.tsx`, aging workspace integration
  and `apps/web/e2e/project-freelance-payables.spec.ts`.
