# ERP-977

- Extended `reclassifyFunding` on both expenses and purchase invoices to support `financialAccountId` (including `company_cash`, `owner_custody_cash`, `company_bank`) and `postReplacement` (auto-posting the replacement when `postReplacement: true` or when an `owner` calls in `solopreneur` mode).
- Added `POST /expenses/by-external/:system/:externalId/reclassify-funding` and `POST /commercial-documents/by-external/:system/:externalId/reclassify-funding` so automation/CLI can address records by `externalReference`.
- Updated OpenAPI, gate matrix, and `BR-FUND-004`.
