# ERP-130 implementation summary

- Added multi-role organization-scoped parties for client, supplier, freelancer and employee identities.
- Added organization-scoped tax ID, bank account and external-reference uniqueness foundations.
- Added non-destructive merge links and inactive/merged party states.
- Added project lifecycle, owner membership, client, contract type, currency, exact budget and date controls.
- Added contracts and milestones with exact minor-unit values.
- Added migration `0003_perpetual_hydra.sql` and organization-isolation integration coverage.

Start commit: `cddb7f2cffc71304a692d420c8d0681d81182139`.

Rules covered: `BR-PTY-001`, `BR-PRJ-001`.
