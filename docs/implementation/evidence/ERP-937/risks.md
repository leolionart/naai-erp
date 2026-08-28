# Risks and follow-ups

- Existing commercial-document validation still reads legacy `dimension_values(kind=category)`;
  a follow-up should switch validation/report joins to `business_categories` or maintain a
  deliberate synchronization policy.
- Migration seeds revenue rows only when the target account exists; tenants with custom COA must
  create or map accounts before activating those categories.
- Full browser E2E against a migrated tenant remains a follow-up; local type/unit and web suites pass.
