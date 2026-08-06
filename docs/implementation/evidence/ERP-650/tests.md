# ERP-650 test evidence

Blocking coverage:

- `T-SNP-001` / `T-UNIT-ERP-650-001`: canonical snapshot inputs, version/source boundaries and stable SHA-256 reproduction.
- `T-EXPOR-001` / `T-INT-ERP-650-002`: audited CSV/XLSX generation from one workbook model with review-required exports never labelled final.

Executed local checks:

```sh
node tests/fixtures/golden/GF-EXPORT-001/verify.mjs
pnpm check
pnpm db:check
pnpm test:fixtures
RUN_DB_INTEGRATION=1 pnpm --filter @naai-erp/api exec vitest run src/report-exports/accountant-exports.integration.test.ts
pnpm test:e2e
git diff --check
```

Local results:

- `GF-EXPORT-001`: pass for canonical hashes, readiness, workbook and reproduction.
- Domain: 180/180 tests pass.
- Public contracts: 48/48 tests pass.
- Database: 15 non-PostgreSQL tests pass; migration journal validation passes for all 34 entries.
- API non-PostgreSQL suite: 63 tests pass. A fresh PostgreSQL 16 database passes 3/3 ERP-650 integration tests, including immutable snapshots, valid cross-organization 404 isolation, idempotent replay, stable cross-process XLSX bytes, CSV/XLSX parse-back, audit, reproduction, non-final review exports and controlled supersede.
- First-party CLI: 217/217 tests pass, including executable binary download to an explicit output path with JSON-only stdout metadata.
- Web unit tests: 28/28 pass.
- Full desktop/mobile Playwright: 55/55 pass, including four ERP-650 journeys.
- `pnpm check`, `pnpm db:check`, `pnpm test:fixtures` and `git diff --check`: pass in the integrated worktree.

Exact-commit GitHub CI evidence will be appended after the implementation commit is pushed and the authoritative PostgreSQL/Playwright workflow completes.
