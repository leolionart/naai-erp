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

Both endpoints return XLSX attachments and an `X-Content-Sha256` response header. Money cells carry
exact minor-unit strings and must not be converted to binary floating point.

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
