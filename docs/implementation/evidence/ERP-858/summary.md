# ERP-858 summary

Implemented the organization-scoped `owner_final` expense and tax workflow foundation.

- Added `controlled | owner_final` organization policy and settings UI.
- Persisted management, CIT and VAT decisions on purchase-invoice lines.
- Owner-final defaults documented operating costs to management-valid/CIT-eligible and VAT-eligible
  when VAT exists; explicit decisions win.
- Preserved non-documented/personal exceptions and prevented asset-account purchases from reducing
  CIT immediately.
- Financial tax reports now consume persisted purchase-line decisions instead of hardcoding
  purchase invoices as unreviewed.
