# ERP-300 Summary

Implemented sales invoices, purchase invoices and linked sales credit notes.

- Exact integer-money headers, lines, payment dates and multi-project/dimension allocations.
- Type-specific lifecycle matrices: sales/credit validate then issue; purchase capture, verify, approve then post.
- Financial issue/post creates the linked balanced journal, document transition, audit, outbox and idempotency result in one PostgreSQL transaction.
- Sales: Dr AR, Cr allocated revenue/deferred account and allocated VAT output.
- Purchase: Dr allocated expense/asset and reviewed VAT account, Cr AP; tax-bearing allocations require a reviewed tax-state snapshot.
- Credit note: references an issued sales invoice and original line, locks the original during create, caps cumulative net and tax independently, and posts inverse revenue/VAT against AR without changing original history.
- Final commercial fields, lines and allocations are database-immutable after issue/post.
- REST/OpenAPI and first-party CLI provide organization-scoped machine-readable create/read/filter/workflow coverage.

Start commit: `a6be5b6f4a591ce3a73e327d9b3a80999e4fe96f`.
Implementation commit: `9408d00a694ff5c1246e20732055debeb86e0220`.
Verified CI: https://github.com/leolionart/naai-erp/actions/runs/30992011125
