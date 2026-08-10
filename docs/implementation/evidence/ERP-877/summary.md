# ERP-877 summary

Expense Quick View now presents one management-metadata form for posted expenses. The form updates
the active supplier/payee, business purpose, line descriptions and category through one versioned,
idempotent API request. Amounts, tax decisions, allocations, funding treatment, account codes and
journal linkage remain immutable.

Changed surfaces: expense API/service/store, database immutability trigger migration, OpenAPI,
Expense Quick View UI and focused regression tests.
