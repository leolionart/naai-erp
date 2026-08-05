# ERP-540 acceptance evidence

ERP-540 is ready for integrated review, not final acceptance.

Current acceptance coverage:

- Pass locally: gross, contribution and fully loaded profitability are displayed as separate values and percentages.
- Pass locally: recognized revenue is the profitability basis; invoiced and collected cash remain distinct axes.
- Pass locally: realized hourly rate and utilization expose their denominators.
- Pass locally: utilization uses approved billable minutes/hours divided by available billable capacity, not all recorded project time.
- Pass locally: unbilled work, overdue AR, overrun and missing dimensions are supported as confidence flags.
- Pass locally: the queue links to a dedicated project drill-down instead of expanding the entire workflow on one page.
- Pass locally: report filters use a Sheet and persist in the URL.
- Pass locally: revenue, labor/freelancer direct cost and variable/fixed overhead source rows preserve version/drill-down identifiers.
- Pass locally: `GF-PROJECT-001` independently recalculates project and total profitability and ties four report controls to ledger/read-model totals with zero difference.
- Pass locally: final backend response, OpenAPI/capabilities and first-party CLI match the report/detail UI contract.
- Pass locally: complete monorepo check, migration validation, fixture suite and 30-scenario desktop/mobile Playwright suite are green.
- Pending final proof: pushed exact-commit GitHub CI.
