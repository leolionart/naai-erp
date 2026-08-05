# ERP-100 implementation summary

- Implemented organization, global user, organization membership and normalized membership-role foundations.
- Implemented fiscal-year and fiscal-period storage with organization-composite ownership constraints.
- Implemented domain factories and controlled fiscal-period state transitions for `open`, `soft_locked` and `hard_locked`.
- Implemented ISO-style currency codes and exact decimal exchange rates with source and observation timestamp.
- Added Drizzle schema and migration `0000_demonic_stick.sql` for PostgreSQL 16.
- Added stable test-catalog records for `T-ORG-001`, `T-PER-001` and `T-CUR-001`.

Start commit: `29921f247626bf64618d6c71020ad409b3544797`.

Rules covered: `BR-ORG-001`, `BR-PER-001`, `BR-CUR-001`.
