# ERP-740 Summary

Successfully executed the real native workbook import pipeline for tenant `naai` and verified transactional database commits.

## Import Statistics (Commit 1)

- **Parties Created:** 14
- **Roles Created:** 14
- **Projects Created:** 29
- **Sales Invoices Created:** 41
- **Expenses Created:** 200
- **Skipped Zero Rows:** 14
- **Journals Created:** 241 (482 lines)
- **External References:** 241
- **Audit Events:** 1
- **Stable Audit Event:** `6f366f78-f033-4e28-a405-a70a55045148`
- **Trial Balance:** Debit = Credit = 987,753,157 (unbalanced = 0)

## Idempotency (Retry)

- **Status:** Created all zero records; all counts remained unchanged.

## Reconciled Totals

- **Calendar Totals:** Sales 195,261,583 / Expenses 443,293,388 / Profit -248,031,805
- **Legacy Totals:** Sales 244,717,833 / Expenses 298,148,067 / Profit -53,430,234
- **Variances:** Empty (zero unexplained control variances)

## Runtime configuration

- **Release separation (2026-08-09):** Main image publication now validates only the release
  manifest and Docker Compose packaging contract before building all four images. Full lint,
  typecheck, database, unit and browser suites remain in the independent CI workflow for pull
  requests and manual runs; routine `main` pushes no longer start the `quality` job.

- **API Runtime:** The native preview propagates its explicit `DATABASE_URL` through Turbo and serves the imported `naai` tenant on localhost.
- **CI:** [Run 31096199429](https://github.com/leolionart/naai-erp/actions/runs/31096199429) passed for exact commit `edcbb6695aa31189e41c2c429b6a1644ce2f2f3f`.
- **Release:** [Run 31096200210](https://github.com/leolionart/naai-erp/actions/runs/31096200210) published all four images with `main` and immutable `sha-edcbb6695aa3` tags. Every build recorded OCI revision `edcbb6695aa31189e41c2c429b6a1644ce2f2f3f`.

| Image                                 | Published digest                                                          |
| ------------------------------------- | ------------------------------------------------------------------------- |
| `ghcr.io/leolionart/naai-erp-api`     | `sha256:e0d4544854a3829207e65594241d7edc4013389b5d90e465a743b155e85fadf1` |
| `ghcr.io/leolionart/naai-erp-web`     | `sha256:7c4bee1341c6d9eeb3743736451c732723ac445d9dd2504c5a38a5e12209449c` |
| `ghcr.io/leolionart/naai-erp-worker`  | `sha256:a883f936f4c2968f49029485d11aa8d232a2fa8393f83e3e000b13dc8b2ca180` |
| `ghcr.io/leolionart/naai-erp-migrate` | `sha256:186b3b6da66fd64a845dddaf55f481b5cdd3887dddbc2866f427cefb375ef780` |
