# Gate G3 Acceptance

- [x] Document/expense issue or post produces the exact expected journal for reviewed fixtures.
- [x] Identical inbound webhook replay produces no duplicate business effect; changed payload conflicts.
- [x] Authenticated invalid/unmapped payload enters quarantine with zero document/journal effect.
- [x] Evidence signed-download authorization is organization-scoped, RBAC-controlled, time-limited and audited.
- [x] Cross-module source → exact linked journal → accepted authorized evidence readback exists with cross-org denial.
- [x] Operational admin routes and primary create flow pass desktop/mobile E2E.
- [x] ERP-346 exact-commit CI passes all PostgreSQL and browser checks.
