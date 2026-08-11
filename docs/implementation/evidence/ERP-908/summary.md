# ERP-908 summary

Added an `API & tự động hóa` action to the expense page header. Its dialog builds complete
production cURL examples for canonical purchase-invoice ingestion and purchase-product creation.
The production credential is read from the authenticated encrypted session only after an explicit
same-origin action and is never stored in source or a public browser environment variable.

Files changed include the expense page, reusable module-page actions, the automation dialog,
the authenticated token endpoint, regression tests and the linked product/testing documentation.
