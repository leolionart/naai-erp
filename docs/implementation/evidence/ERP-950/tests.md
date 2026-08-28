# Tests

- `DATABASE_URL=postgresql://naai_erp:naai_erp@127.0.0.1:5432/naai_erp pnpm --filter @naai-erp/database db:migrate`
- `pnpm test:docs`
- `pnpm exec prettier --check db/migrations/0063_repair_business_categories.sql`
