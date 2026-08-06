# ERP-710 Summary

Implemented organization-scoped external references for commercial documents and expenses, including Paperless-aware inbound webhook identity, `sales_invoice.create`, `purchase_invoice.create`, `credit_note.create`, and cross-model duplicate prevention.

Native PostgreSQL verification used the isolated organization `org-verify710-1786012077` and source `verify710-1786012077`. Signed sales and purchase events created correctly directed draft documents. Replaying each identical external event with a different HTTP idempotency key returned the same inbound message, document, audit event, and outbox event instead of creating another business effect.

The verification left `naai` untouched and stopped the temporary native API afterward.
