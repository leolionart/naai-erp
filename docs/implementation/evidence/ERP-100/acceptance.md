# ERP-100 acceptance

- [x] Organization records define legal name, base currency and timezone.
- [x] Users can belong to multiple organizations through organization-scoped memberships.
- [x] Roles cannot be assigned without a membership in the same organization.
- [x] Fiscal years and periods belong to exactly one organization through composite keys.
- [x] Fiscal-period domain transitions model open, soft-lock, hard-lock and approved reopen behavior.
- [x] Exchange rates retain source currency, target currency, exact rate, source and timestamp.
- [x] Domain validation rejects empty identities, invalid currencies, unsafe rates and invalid period transitions.
- [x] Clean PostgreSQL migration and cross-organization database constraint tests pass.
- [x] Test aliases `T-ORG-001`, `T-PER-001` and `T-CUR-001` are registered and rerunnable.
- [x] Repository quality gate passes.

ERP-100 is complete. ERP-110 is now ready; Gate G1 remains in progress.
