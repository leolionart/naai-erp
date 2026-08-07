# ERP-840 Tests

- `node scripts/seed-local-demo.mjs --bootstrap-checker` — passed after idempotent replay; all report
  checks passed and snapshot/exports were generated.
- `node scripts/seed-local-demo.mjs --verify` — passed read-only with zero failed reports.
- `pnpm exec eslint scripts/seed-local-demo.mjs` — passed.
- `pnpm demo:verify` — passed with zero failed reports.
- `pnpm test:docs` — passed; verified 10 accepted ADRs, 11 rule references and 27 AI
  relationship resources.
- `git diff --check -- <ERP-840 files>` — passed.

Verified reports: trial balance, general ledger, P&L, balance sheet, cash flow, VAT reconciliation,
expense exceptions, AR aging, AP aging, project profitability, executive metrics, operating dashboard
and performance comparisons.
