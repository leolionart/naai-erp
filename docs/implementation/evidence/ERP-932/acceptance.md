# ERP-932 acceptance

- Canonical customer/project/date/amount/state presentation: proved by unit and Playwright tests.
- 2025 recognition enrichment: proved by PostgreSQL list/detail integration assertions.
- Commercial-document compatibility: proved by direct-party precedence coverage.
- Responsive behavior: proved by desktop recognition flows and mobile ERP-520 overflow coverage.
- Legacy field safety: deprecated names stay documented; no destructive migration or data deletion.
- Adjacent mismatch audit: subscription-only dead fields are hidden, raw party identifiers are not used
  as business labels, missing project links are guarded, and profitability types match runtime payloads.
