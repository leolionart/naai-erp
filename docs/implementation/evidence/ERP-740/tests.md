# ERP-740 Tests

- 2026-08-09 release regression: verified the image workflow no longer duplicates `pnpm check`,
  PostgreSQL integration or Playwright E2E; it still validates the four-image manifest, Compose
  contract, multi-architecture publication, immutable SHA tags, OCI provenance and SBOM.

- Compose contract passed.
- Four local images built non-root; persistence sentinel survived stack recreation.
- Release workflow verifier and `actionlint` passed.
- CLI tests: 228/228 passed.
- Real workbook extraction test: 1/1 passed.
- Workbook PostgreSQL integrations: 9/9 passed.
- **Real Native Workbook Import (Commit 1, tenant `naai`):**
  - Created 14 parties, 14 roles, 29 projects, 41 sales invoices, and 200 expenses.
  - Skipped 14 zero rows.
  - Generated 241 journals (482 journal lines) with 241 external references and 1 audit event.
  - Persisted stable audit event `6f366f78-f033-4e28-a405-a70a55045148`.
  - Trial Balance: Debit = Credit = 987,753,157 (unbalanced = 0).
- **Idempotency (Retry):**
  - Retry created all zero records; all counts remained unchanged.
- **Financial Totals & Reconciliations:**
  - Calendar Totals: Sales 195,261,583 / Expenses 443,293,388 / Profit -248,031,805.
  - Legacy Totals: Sales 244,717,833 / Expenses 298,148,067 / Profit -53,430,234.
  - Variances: Empty (zero unexplained control variances).
- **Runtime Environment:**
  - Native preview propagates `DATABASE_URL` through Turbo and serves the imported `naai` tenant on localhost.

Exact-commit proof completed:

- [CI run 31096199429](https://github.com/leolionart/naai-erp/actions/runs/31096199429) passed for `edcbb6695aa31189e41c2c429b6a1644ce2f2f3f`.
- [Release run 31096200210](https://github.com/leolionart/naai-erp/actions/runs/31096200210) passed and pushed API, web, worker, and migrate images.
- Both `main` and `sha-edcbb6695aa3` tags were emitted for every image.
- Build metadata recorded the full commit as `org.opencontainers.image.revision` for all four images.
- Published digests: API `sha256:e0d4544854a3829207e65594241d7edc4013389b5d90e465a743b155e85fadf1`; web `sha256:7c4bee1341c6d9eeb3743736451c732723ac445d9dd2504c5a38a5e12209449c`; worker `sha256:a883f936f4c2968f49029485d11aa8d232a2fa8393f83e3e000b13dc8b2ca180`; migrate `sha256:186b3b6da66fd64a845dddaf55f481b5cdd3887dddbc2866f427cefb375ef780`.
