# Acceptance

- Canonical catalog: `business_categories` stores organization, kind, code, name, account/tax mappings and active/version state.
- API/CLI contract: `master-data/categories` is registered with kind+code identity and supports `kind`/`is_active` filters; generic master-data mutation and CLI paths remain available.
- Assignment: revenue and expense forms load only active canonical categories and show explicit empty/error states instead of silently using demo values.
- Compatibility: existing `expense_categories` rows are backfilled; deactivation is non-destructive.
