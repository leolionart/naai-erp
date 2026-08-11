# ERP-889 acceptance

- Canonical versioned REST mutation and first-party CLI path: implemented.
- Active organization cash/bank funding account and exact receipt date/amount: implemented.
- One receipt to one/many invoices and multiple receipts per invoice: implemented.
- Exact allocation and outstanding limits: implemented.
- Balanced Dr funding / Cr AR posted journal: implemented.
- Open-period, organization, role, audit, idempotency and outbox controls: implemented.
- Invoice partial/full state and AR aging from allocations: implemented.
- PostgreSQL API integration: passed against the locally migrated schema.
- Migration `0048_customer_receipts` applied and the native database reports `49/49` healthy.
- Desktop and mobile receipt-dialog journeys: passed `2/2`.
- Full repository quality gate: passed.
