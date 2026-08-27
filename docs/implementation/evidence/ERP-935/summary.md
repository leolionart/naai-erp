# ERP-935 summary

The localhost record `00267579` exposed the complete defect: its list and detail responses had
`category: null` and an empty line `dimensions` object, while the resolved category
`VEHICLE_RENTAL` existed only in `lines[].allocations[].dimensions.category`. The detail form merged
allocation dimensions; the list projection read only the root/line dimension and rendered `—`.

The fix has two layers:

- `apps/web/src/lib/records/category.ts` is now the shared list/detail adapter. It prefers the root
  projection, then line aliases, line dimensions and allocation dimensions.
- `PgCommercialDocumentStore` now projects the category root from either line dimensions or the first
  allocation category for both list and detail queries.

No accounting totals, journal history or source records were mutated.
