# Database seed data

Only synthetic development and test data belongs here. Production is never automatically seeded.

`tt133-mvp.mjs` is the explicit, idempotent TT133 MVP setup used by `pnpm seed:dev`. It creates a
synthetic organization, fiscal periods, minimal accounts, reviewed VAT codes, category defaults and
an approved financial-statement mapping. The command requires `ALLOW_DEVELOPMENT_SEED=true` and
refuses to run when `NODE_ENV=production`.
