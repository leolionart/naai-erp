# ERP-1006 - keyset indexes and SQL pagination

- Migration `0080_keyset_list_indexes.sql` adds (organization, date desc, id) indexes for journals, expenses, commercial documents, bank transactions, statement imports and customer receipts.
- `GET /banking/transactions`, `/banking/imports` and `/customer-receipts` now page in SQL with `limit`, `cursor`, `q`, `sort`, `includeTotal`; customer receipt `get` reads one row instead of listing all and filtering.
- Commercial document and journal lists read lines through a correlated subselect so the page is cut on the index before any line is read.
- The focused record list no longer fetches every uncategorized invoice one by one (N+1); the list projection already carries the category.
- `GET /banking/reconciliations` pages in SQL first and expands only the page rows (previously every reconciliation of the organization was expanded with several queries each).
