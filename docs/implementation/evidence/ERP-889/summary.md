# ERP-889 summary

Implemented the complete canonical manual customer-receipt workflow. A cash or bank receipt posts a
balanced journal, allocates its exact amount across one or more eligible sales invoices and derives
partial/full invoice state and AR aging from canonical allocations. REST, OpenAPI, CLI, domain,
contract, persistence, audit, idempotency and outbox surfaces are included. Receivables now expose a
responsive receipt dialog on both the queue and customer-detail workspaces.

No direct PostgreSQL integration path is exposed to clients.

Primary files delivered:

- `packages/domain/src/customer-receipts.ts` and its unit test.
- `packages/contracts/src/customer-receipts.ts` and its contract test.
- `db/migrations/0048_customer_receipts.sql` and database schema/barrel registration.
- `apps/api/src/customer-receipts/`, API module registration and AR aging integration.
- `apps/cli/src/client.ts` and CLI regression coverage.
- `apps/web/src/app/workspaces/customer-receipt-dialog.tsx`, both aging workspaces and
  `apps/web/e2e/customer-receipts.spec.ts`.
- OpenAPI, business rules, executable test specification and catalog entries.
