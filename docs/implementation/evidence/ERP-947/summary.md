# ERP-947 evidence — correction originals in operational views

Correction/reverse-replacement keeps the original source and journal immutable for audit, while
operational listings and official source-based exports omit cancelled commercial documents and
reversed expenses by default. Explicit state filters and detail routes still expose history.

Changed stores: commercial-document list, expense list, purchase/expense list export and VAT
reconciliation source query. Added durable expense correction lineage (`original_expense_id`),
export correction status/lineage columns, integration regression coverage and documented the
listing rule. Existing correction links are backfilled from audited reverse-replace events.
