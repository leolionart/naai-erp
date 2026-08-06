# ERP-630 acceptance evidence

Current acceptance coverage:

- Pass locally: P&L is explicitly labeled accrual management basis and separates revenue, direct cost, gross profit, OPEX, operating profit, other items, tax and net profit. Cash movement is provided by the separately labeled direct Cash Flow report; the API rejects a misleading cash-basis P&L request.
- Pass locally: Balance Sheet throws a report error on any nonzero `Assets - Liabilities - Equity` difference and never creates a hidden plug.
- Pass locally: direct Cash Flow separates operating, investing and financing; fixture/API cases map owner contribution, loan proceeds/repayment and withdrawal to financing, and internal-transfer principal has zero net impact.
- Pass locally: VAT reconciliation separates output, input, eligible input, ineligible input and unreviewed/missing-evidence amounts; the independent oracle proves credit-note reversal and material exceptions prevent ready status. PostgreSQL regression coverage additionally requires purchase credit notes to inherit the original purchase document's input-VAT direction; exact CI execution is pending.
- Pass locally: tax expense review preserves independent accounting-booked, CIT and VAT states with reviewer/reason/reference/evidence metadata.
- Pass locally: derived statement lines and account rows expose journal line/source IDs under the same organization, cutoff and approved mapping version.
- Pass locally: REST/OpenAPI/capabilities, first-party CLI and dedicated admin pages expose the same exact-string-money contracts.
- Pass locally: landing plus dedicated P&L, Balance Sheet, direct Cash Flow, VAT reconciliation and tax exception pages use URL-backed Sheet filters, source Drawer, blocking Alerts and responsive tables; targeted Playwright passes 6/6 and the full suite passes 47/47.
- Pass locally: `pnpm check`, `pnpm db:check`, `pnpm test:fixtures` and `pnpm test:e2e` pass in the integrated worktree.

Exact-commit PostgreSQL integration and complete GitHub quality-job evidence must pass before ERP-630 is marked done.
