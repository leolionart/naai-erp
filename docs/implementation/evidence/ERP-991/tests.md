# ERP-991 — Test Results

## Commands and Results

- Real-UI Playwright suite against live `@naai-erp/api` + migrated scratch PostgreSQL database (`T-E2E-EDIT-003`):
  - `pnpm test:e2e:real` -> **PASS** (`8 passed`, `0 failed`; scratch PostgreSQL database created, migrated, seeded, verified across desktop + 390px mobile Chromium, and dropped cleanly)
- Web unit tests (including `record-allocation-normalizer.test.ts`):
  - `pnpm --filter @naai-erp/web test` -> **PASS** (`42 test files passed`, `141 tests passed`)
- Repository formatting, documentation, release, lint, and typecheck gates:
  - `pnpm exec prettier --write ...` / `pnpm format:check` -> **PASS**
  - `node scripts/verify-docs.mjs` -> **PASS** (`Verified 11 accepted ADRs, 12 rule references, and 29 AI relationship resources.`)
  - `pnpm test:release` -> **PASS** (`Release workflow verified`, `Compose packaging contract passed`, `Production latest-image update contract passed`)
  - `pnpm lint` -> **PASS** (`0 errors`, `0 warnings` on all new files)
  - `pnpm typecheck` -> **PASS** (`10/10 packages passed`)
