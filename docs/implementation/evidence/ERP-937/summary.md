# ERP-937 Unified revenue and expense category catalog

Implemented an organization-scoped `business_categories` catalog with `expense` and `revenue`
kinds, optional account/tax mappings, CRUD/deactivation through `master-data/categories`, and
active-kind filtering for entry forms. Existing expense categories are backfilled and standard
revenue categories are seeded when their account exists.

Changed areas: API master-data registry/filtering, database schema and migration 0062, shared
contracts, Master Data category workspace, revenue/expense forms, and task/business-rule docs.
