# ERP-851 tests

- `pnpm --filter @naai-erp/contracts exec vitest run src/portable-data-packages.test.ts` — 3/3 passed.
- `pnpm --filter @naai-erp/contracts exec tsc --noEmit` — passed.
- `pnpm --filter @naai-erp/cli exec vitest run src/client.test.ts src/main.test.ts` — 123/123 passed.
- `pnpm --filter @naai-erp/cli exec tsc --noEmit` — passed.
- `pnpm --filter @naai-erp/api exec vitest run src/portable-data-packages/portable-data-package.service.test.ts` — 4/4 passed.
- `RUN_DB_INTEGRATION=1 DATABASE_URL=postgresql://naai_erp:naai_erp@127.0.0.1:5432/naai_erp pnpm --filter @naai-erp/api exec vitest run src/portable-data-packages/local-organization-reset.integration.test.ts` — 3/3 passed.
- `pnpm --filter @naai-erp/api exec tsc --noEmit` — passed.
- `pnpm test:docs` — passed.
- Staging workbook formula-error scan — 0 errors; purchase-line arithmetic mismatch — 0.
- Full backup SHA-256 readback — `212c8955bb86021558a7f8b95a306897e26513f0b09433f58f94283ad3401cba`.
- Staging workbook SHA-256 readback — `6a892b36ceef376dffe1b36f6e2987d7ead6a8d8c3b4119c12af50f6e5ee9906`.
- `pnpm --filter @naai-erp/api exec vitest run src/report-exports/accounting-list-workbook.test.ts src/report-exports/report-export.service.test.ts src/portable-data-packages/portable-data-package.service.test.ts` — 9/9 passed.
- Generated live local sales and purchase/expense XLSX files — five sheets each, formula error scan returned zero results, accountant schedule rendered and visually inspected.
- Accountant-source enrichment staging SHA-256 — `efdbf73c401d9a0b5f15aa81c4fa12e0ff861a3fef39bc09b2ab46ac5ffa08c5` before final backlog disposition pass.
- Final staging SHA-256 — `4b86f0f37ebf21067269abff34fef19ef06c245c12bf913361927fd104ce9918`.
- Final staging checks — open review 0; party IDs 75/75 unique; projects 35/35 unique; purchase-line arithmetic mismatch 0; formula-error scan 0.
- `pnpm --filter @naai-erp/api exec vitest run src/portable-data-packages/erp851-staging-converter.test.ts src/portable-data-packages/portable-data-import.service.test.ts` — 9/9 passed.
- `pnpm --filter @naai-erp/api typecheck` — passed after converter and external package registration.
- Safe package for organization `naai`: package ID
  `86dd9164-5aff-5ca2-a1f3-340b2f1e243d`, workbook SHA-256
  `09f7f5e1c47758e1a8f97b039af4a3bd729e9469750aa02e75bd2a2c481a68ec`, 110 rows.
- Authenticated API dry-run import `432785d2-9267-449e-93f2-17b9b555194f`: valid, 2 sheets,
  110 ready, 0 invalid, 0 conflicts, 0 unchanged. Database readback after dry-run remained 7 parties
  and 2 projects, proving zero business mutation.
- `pnpm --filter @naai-erp/api exec vitest run src/commercial-documents/commercial-document.service.test.ts src/portable-data-packages/erp851-staging-converter.test.ts src/portable-data-packages/portable-data-import.service.test.ts src/portable-data-packages/portable-canonical-mutation.adapter.test.ts` — 25/25 passed.
- Final draft-financial artifact: package ID `6cbb2f20-0966-5e68-a881-afcb5fbecae0`, workbook SHA-256
  `a5e56109cfe9a0d894f8b1cb3cec4006ced2762b7921bd8affd11c0bf13772a5`.
- Final artifact control: 343 rows = 75 parties + 35 projects + 121 purchase invoices + 112
  positive, funding-classified expenses. Authenticated dry-run import
  `00ea8b08-1725-48fa-b536-ea689f917516`, dry-run
  `9b8f8a5d-13e4-4785-873d-c8f2ae9bffae`: valid, 343 ready, 0 invalid, 0 conflicts.
- Reset regression with a valid excluded manifest sheet: 3/3 DB integration tests passed.
- Converter regression for project enum/required relationships and unique supplier invoice
  references: 3/3 tests passed; API typecheck passed.
- Retained cutover backup: package `5e374385-961a-4e14-8bbc-c2ef2771d4ed`, SHA-256
  `4441db74e2ae4a7eb8ac56a44fa13b1903e429b511b49a86bc5d41216b786b50`.
- Final corrected artifact: package `fcd65678-9d91-5318-a42d-555a37f1d7d3`, SHA-256
  `49fb54629802666a7995f6d9510dc292ddf84ba819782377fe1fd271367125f4`.
- Final dry-run import `04f7ad4f-bf5c-438d-a172-f54d09c8e4fa`, dry-run
  `2da67075-9009-4ed4-8b35-4a2452d51123`: 343 ready, 0 invalid, 0 conflicts.
- Final commit and replay: committed=true, applied 343, failed 0; the same idempotency key produced
  no duplicates.
- Readback: 75 parties; 35 projects totaling 702,882,650 VND; 121 draft purchase invoices totaling
  232,736,813 VND gross; 112 draft expenses totaling 387,376,715 VND; 0 demo IDs; 0 duplicate
  external references; 0 unbalanced posted journals.
- Official-recognition readback after owner confirmation: 121/121 purchase invoices posted for
  232,736,813 VND gross and 112/112 expenses posted for 387,376,715 VND gross.
- Posted account totals: debit 642-OPEX 601,605,074; debit 1331-VAT 18,508,454; credit 331-AP
  232,736,813; credit 3388-OWNER 352,758,650; credit 112-BANK 34,618,065. Total debits and credits
  both 620,113,528 VND; unbalanced journals 0.
- Fiscal-period readback: 12 open monthly periods for each of 2024, 2025 and 2026. Maker-checker
  policy restored to `allow_self_approval=false` after the cutover.
- Completeness-first sales readback: 8/8 sales invoices issued; net 115,256,787 VND, VAT 5,402,163
  VND, gross 120,658,950 VND. External system `erp851-brtt78` has 8 references.
- Banking-source readback: 45/45 revenue/receipt activity rows imported, 0 rejected/duplicates, net
  source movement 348,271,725 VND across 2025-01-13 through 2026-07-18.
- Final ledger readback after sales issue: 241 posted journals; unbalanced journals 0.
- Funding-source UI regression: focused expense-management E2E 1/1 passed; ledger-derived dashboard
  E2E 1/1 passed. Web typecheck passed.
- Expense tax-default regression: 8/8 service tests passed; API typecheck passed. Obsolete
  `documented_operational` inference was removed; personal/non-documented/petty-cash classes default
  tax-ineligible while other classes remain unreviewed.
- Documentation verification and `git diff --check`: passed.
- Provisional payroll-history correction readback: all 12 inferred 2023 draft rows were discarded
  through the guarded expense API, with 12 audit events and 12 outbox events. The retained 2024
  history has 12 draft rows totaling 187,000,000 VND and 0 journal IDs. Posted payroll remains
  187,000,000 VND for 2025 and 30,000,000 VND for 2026. Fiscal-period configuration remains intact.
- Expense entry UI: web typecheck passed and focused expense-management E2E 1/1 passed after replacing
  obsolete `documented_operational` with canonical classes and adding complete line/allocation data.
