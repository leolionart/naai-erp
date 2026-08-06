# ERP-710 Tests

Verified against native PostgreSQL and a temporary API process with an explicit database connection:

- A correctly signed `sales_invoice.create` event returned HTTP 201 and created draft sales invoice `doc-sales-verify710-valid`.
- Replaying the same sales external identity with a different HTTP idempotency key returned `idempotencyReplayed: true` and the same message, document, audit, and outbox identities.
- A correctly signed `purchase_invoice.create` event returned HTTP 201 and created draft purchase invoice `doc-purchase-verify710-valid`.
- Replaying the same purchase external identity with a different HTTP idempotency key returned `idempotencyReplayed: true` and the same identities.
- Database readback found exactly two valid commercial documents, two processed inbound messages, and two `paperless` external references for the verified external identities.
- Sales direction persisted as `sales_invoice`; purchase direction persisted as `purchase_invoice`.
- Authenticated invoice events with missing line allocations were quarantined with `DOCUMENT_ALLOCATION_MISMATCH`; retry replayed the same quarantined message and created no document or external reference.
- All verification data was scoped to `org-verify710-1786012077`; `naai` was not queried or mutated.
- The temporary native API was stopped after verification.

Exact-commit CI passed for `edcbb6695aa31189e41c2c429b6a1644ce2f2f3f` in [run 31096199429](https://github.com/leolionart/naai-erp/actions/runs/31096199429). The run completed the repository quality gate, migrations, database/API/worker tests, and 67/67 Playwright tests.
