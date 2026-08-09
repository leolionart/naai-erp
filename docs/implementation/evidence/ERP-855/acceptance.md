# ERP-855 acceptance

- Organization-scoped purchase product schema and migration: passed on an empty database.
- VAT is restricted to exactly 8% or 10% in service validation and PostgreSQL: passed.
- REST API/CLI add, read, update and deactivate operations: passed.
- Deactivation preserves product history instead of hard deleting it: passed with versioned readback.
