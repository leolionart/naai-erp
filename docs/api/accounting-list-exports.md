# Accounting list workbook exports

ERP-841 exposes two organization-scoped, filterable accountant workbooks through REST and the
first-party CLI.

## Sales invoice workbook

`GET /api/v1/organizations/{organizationId}/accounting-list-exports/sales-invoices`

Filters: required `startsOn`, `endsOn`; optional `state`, `partyId`, `projectId` and
`invoicePresence=all|present|missing`.

## Purchase invoice and expense workbook

`GET /api/v1/organizations/{organizationId}/accounting-list-exports/purchase-invoices-expenses`

Filters: required `startsOn`, `endsOn`; optional `state`, `payeePartyId`, `projectId` and
`invoicePresence=all|present|missing`.

Purchase invoices and non-invoice expenses share a workbook for accountant review, but every record
keeps its canonical `sourceType`, stable ID, lifecycle state and detail URL. Similar supplier, date
or amount values are never used to merge or deduplicate records.

## Workbook format

Both endpoints return XLSX attachments and an `X-Content-Sha256` response header. Canonical machine
sheets keep exact minor-unit strings. Presentation sheets use typed Excel integers only while the
amount remains within Excel/JavaScript's exact integer range; generation fails explicitly instead
of silently rounding an unsafe amount.

- `Summary`: applied filters, record counts and exact net, tax and gross controls.
- `Records`: one canonical document or expense per row with source type, stable ID, party/project,
  dates, lifecycle, currency and exact totals.
- `Lines`: document/expense line detail linked by stable record ID.
- `Filters`: normalized request filters and generation metadata for reproducibility.

## CLI

```bash
naai-erp sales-invoice-export download --from 2026-01-01 --to 2026-12-31 --party party-1 --project-id project-1 --output sales-invoices.xlsx
naai-erp purchase-expense-export download --from 2026-01-01 --to 2026-12-31 --payee-party-id supplier-1 --invoice-presence all --output purchase-invoices-expenses.xlsx
```

The CLI refuses to write without explicit `--output`. JSON written to stdout reports the output
path, byte size, content type, filename and SHA-256 when supplied by the API.

## Management formula audit

The management workbook endpoint (`accounting-list-exports/management-workbook`) contains the
canonical source sheets plus dedicated formula-audit sheets. For every month returned by the
backend, Excel recalculates published metrics from typed source rows with `SUMIFS` and shows:

- the backend value (canonical);
- the independently calculated Excel value;
- the signed difference; and
- `PASS` when the difference is zero, otherwise `CHECK`.

The workbook is configured to recalculate when opened. This is an accountant reconciliation aid,
not a second accounting engine: formulas do not write back to ERP and do not replace the backend
report API. VAT output/input, profit, revenue invoiced/recognized/collected, expense and
receivable controls each have their own audit sheet.

## Workbook layout

Both endpoints return a workbook with six sheets:

1. `BRTT78` or `MVTT78`: a Form-78-compatible source schedule with the 21 accountant columns for
   invoice identity, seller, buyer, tax controls, currency, e-invoice state, quarter and month. It
   contains invoice records only; a non-invoice expense is never presented as an electronic
   invoice. Net, VAT and gross controls use `SUBTOTAL` so filtered totals remain auditable.
   Metadata not exposed by the canonical API remains blank and carries a cell note explaining that
   NAAI ERP did not infer it.
2. `Bảng kê bán ra` or `Bảng kê mua vào`: accountant-readable inspection schedule modelled after
   the Vietnamese VAT invoice schedule. It contains the organization and period header, invoice
   identity, counterparty and tax ID, item description, pre-tax amount, VAT rate, VAT amount, gross
   amount, lifecycle state and formula totals.
3. `Summary`: export identity, organization and record counts.
4. `Records`: canonical document/expense headers, stable IDs and lifecycle fields.
5. `Lines`: canonical lines, accounts, tax codes and dimensions.
6. `Filters`: the exact request filters used to generate the workbook.

The presentation schedule uses typed Excel dates and numbers. A non-invoice expense keeps blank
series/number/date fields and is labelled `Chi phí không có hóa đơn`; export never manufactures an
invoice identity. `Records` and `Lines` remain authoritative for machine round-trip and audit.
