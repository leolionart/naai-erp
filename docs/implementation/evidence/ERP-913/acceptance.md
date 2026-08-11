# ERP-913 acceptance

- One HTTP/CLI call accepts basic OCR invoice fields and creates one canonical purchase invoice.
- Supplier tax ID is normalized; an active supplier is reused, otherwise the party and supplier role
  are created idempotently.
- Category accepts a canonical code or human label and uses a strong unique active-category match;
  ambiguous/unknown input fails before supplier mutation.
- Project, payment account and internal accounting account identifiers are not required.
- The response returns supplier, resolved category and canonical document identities.
- Expense Management shows `Xóa hóa đơn nháp` only for draft purchase invoices without a journal.
- Deletion requires current version, idempotency key and reason, keeps audit evidence, refreshes the
  UI and is rejected for progressed/referenced documents.
- OpenAPI, relationship manifest, CLI and contextual automation examples describe the same contract.
