# ERP-1005 Risks & Follow-ups

- **XLSX export scope**: The existing `/accounting-list-exports/purchase-invoices-expenses` API exports all matching server-filtered rows for the selected period/state/invoice-presence; client-side `costMode` affects the interactive chart, summary total, and table view. A backend `costMode` parameter on XLSX export can be added later if needed.
- **No database migration**: Pure web read/filter presentation update; zero schema or ledger impact.
