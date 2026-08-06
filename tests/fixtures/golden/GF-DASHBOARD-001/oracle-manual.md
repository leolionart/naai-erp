# Manual oracle

## Dashboard source equality

- Revenue: `500,000,000` from P&L revenue.
- Net profit: `120,000,000` from P&L net profit.
- Unrestricted cash: `450,000,000` from executive metrics.
- Runway: `4.500` months (`4500` thousandths), copied from executive metrics.
- Top-project fully loaded profit: `80,000,000` from project profitability.
- Outstanding AR: `60,000,000` from AR aging.
- Finance review count: `2` from tax expense exceptions.

The dashboard performs no independent money or ratio calculation.

## Drill-down control

Revenue drill-down: `300,000,000 + 200,000,000 = 500,000,000`.

Each row resolves in organization scope through this typed chain:

`journal_line -> journal_entry -> commercial_document -> evidence`.
