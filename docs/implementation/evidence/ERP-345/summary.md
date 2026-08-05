# ERP-345 Summary

Implemented a reusable admin design system informed by VietERP's shell and page hierarchy without copying its business logic or hard-coded visual system.

- Initialized shadcn/Radix Nova with Tailwind v4, RSC support, Lucide icons and semantic NAAI financial/workflow tokens.
- Replaced the query-string module router with real Next.js routes and one responsive navigation definition.
- Added accessible desktop sidebar, mobile Sheet navigation, skip link, breadcrumbs and route page headers.
- Added shared API/error/idempotency/settings helpers and exact BigInt-safe money/date/status formatters.
- Added reusable financial table, money cell, status badge and KPI card compositions.
- Migrated ledger, document, expense, evidence, inbound and generic admin workspaces away from raw controls to shared shadcn primitives.
- Preserved the existing REST behavior, organization scope, token storage and operational forms.
