# ERP-858 acceptance

- Owner-final policy is exposed through the canonical master-data API and admin settings UI.
- New direct expenses and purchase invoices persist final management/CIT/VAT decisions according to
  organization policy while preserving explicit overrides.
- Purchase-invoice VAT posting and tax reports use the persisted decision.
- Asset-account purchase lines retain zero immediate CIT-eligible amount.
- PostgreSQL migration and affected integration suites pass on a fresh database.
- Legacy records remain unchanged by design; enabling the policy affects newly created or corrected
  records. A separate dry-run is still required before any historical production finalization.
