# ERP-110 implementation summary

- Added five account root types and organization-scoped Chart of Accounts records.
- Added hierarchy edges that enforce same organization and same root type through composite database keys.
- Added control-account/manual-posting policy and domain protection for accounts with ledger history.
- Added effective-dated TT133/TT200 statutory mappings with approval metadata.
- Added effective-dated VAT/CIT/withholding tax policy versions with exact decimal rates, evidence requirements and accountant-review state.
- Added half-open effective-date resolution and overlap validation in the domain.
- Added migration `0001_new_sinister_six.sql`.
- Added a native local preview command that starts Web and API without building Docker images.

Start commit: `63be70dd02e99fdbabb7c16e081fe4ca453159b8`.

Rules covered: `BR-COA-001`, `BR-COA-002`, `BR-TAX-001`.
