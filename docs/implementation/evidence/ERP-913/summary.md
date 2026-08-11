# ERP-913 summary

Implemented one-call purchase-invoice ingestion for n8n/OCR, including deterministic category
resolution, supplier tax-ID lookup/upsert, canonical invoice creation, CLI/OpenAPI documentation and
copyable production cURL examples. Expense Management now exposes an audited delete action for
eligible draft purchase invoices.

The category input accepts an active canonical code, a human-readable OCR label, or may be omitted
when the description has one strong unique match. Category/account validation runs before supplier
creation so invalid classification cannot leave supplier master data behind.

Main changed surfaces: commercial-document API/store, quick-ingestion service, CLI, Expense Quick
View, automation dialog, OpenAPI/relationship docs and task/test catalogs.
