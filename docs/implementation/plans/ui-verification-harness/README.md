# Real-UI verification harness (no mocks)

Purpose: prove that what the web UI sends is accepted by the real API and database. The existing Playwright specs
mock the API, so they pass even when the UI and API disagree (this hid the bugs listed in the plan).

```bash
# 1. scratch database
createdb -h /tmp naai_ui && DATABASE_URL="postgresql:///naai_ui?host=/tmp" pnpm --filter @naai-erp/database db:migrate
psql -h /tmp -d naai_ui -v ON_ERROR_STOP=1 -f docs/implementation/plans/ui-verification-harness/seed.sql
# 2. API (port 3101) — owner can save-and-record; integration token creates drafts
(cd apps/api && DATABASE_URL="postgresql:///naai_ui?host=/tmp" PORT=3101 MIGRATE_ON_START=0 NODE_ENV=development \
  SESSION_SECRET=ui-verify-secret-at-least-32-characters-long WEB_ORIGIN=http://127.0.0.1:3000 npx tsx src/main.ts)
# 3. records created the way automation creates them
python3 docs/implementation/plans/ui-verification-harness/seed_records.py
# 4. web (never use apps/web/.env.local here: it can point at a real API)
(cd apps/web && NEXT_PUBLIC_API_URL=http://127.0.0.1:3101 NEXT_PUBLIC_ORGANIZATION_ID=org-ui \
  NEXT_PUBLIC_API_TOKEN=ui-owner-token NEXT_PUBLIC_NAAI_ERP_DATA_SOURCE=local NEXT_PUBLIC_FORCE_DEFAULT_API_CONNECTION=1 \
  npx next dev --hostname 127.0.0.1 --port 3000)
# 5. drive the UI and print every API response >= 400
PW_CHROMIUM=<path to chromium or headless shell> node docs/implementation/plans/ui-verification-harness/ui-verify.mjs
```

`seed_records.py` creates a posted expense (owner), a draft expense (integration token), a posted sales invoice and a draft
purchase invoice through the ingestion endpoint. `ui-verify.mjs` is a starting point: extend it with one step per UI action
(edit, change category, reclassify funding, void, delete draft, record). The scripts read nothing from the real environment;
`playwright-core` and its browser come from the repository `node_modules`. Scripts live here as references: when ERP-991 turns
them into a proper spec, move them under `apps/web/e2e/real/`.
