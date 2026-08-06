# ERP-710 Acceptance

- External identity is unique within the organization and source system.
- Stable external identity, rather than only the HTTP idempotency key, controls replay: identical events sent with different HTTP keys returned the same persisted result.
- Native database readback confirmed one sales document and one purchase document for the two verified external identities, with no duplicate business effects.
- `sales_invoice.create` and `purchase_invoice.create` preserve their accounting direction in the persisted commercial-document type.
- Paperless external references link each verified external identity to its corresponding document and retain source metadata.
- Invalid but authenticated invoice payloads are quarantined without a document or external reference; their retries remain idempotent.
- Verification was isolated from real imported data in `naai`.
- Credit-note creation and cross-model invoice-backed expense prevention remain covered by the focused automated integration suite.
