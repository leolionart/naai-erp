# Acceptance

- A database with migration 0062 recorded but no `business_categories` relation can be repaired by the next migration.
- Existing category rows and seeded defaults are preserved through `ON CONFLICT DO NOTHING`.
- Fresh databases remain compatible because the repair migration is idempotent.
