# Acceptance

- Cancelled correction originals are absent from the default commercial-document listing: covered
  by the relationship-backfill integration flow.
- Reversed expense originals are absent from the default expense listing, while
  `?state=reversed` still returns history: covered by the expense integration regression.
- Purchase/expense list exports and VAT reconciliation omit cancelled/reversed originals when no
  explicit lifecycle state is requested. Export raw records include correction status and lineage
  IDs so an accountant can filter `original`, `corrected_original` and `replacement` explicitly.
- Detail endpoints remain unchanged and continue to return the original for audit drill-down.
