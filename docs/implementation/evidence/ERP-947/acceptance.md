# Acceptance

- Cancelled correction originals are absent from the default commercial-document listing: covered
  by the relationship-backfill integration flow.
- Reversed expense originals are absent from the default expense listing, while
  `?state=reversed` still returns history: covered by the expense integration regression.
- Purchase/expense list exports and VAT reconciliation omit cancelled/reversed originals when no
  explicit lifecycle state is requested. Export raw records include correction status and lineage
  IDs so an accountant can filter `original`, `corrected_original` and `replacement` explicitly.
- Detail endpoints remain unchanged and continue to return the original for audit drill-down.
- Purchase-invoice create and quick-ingestion requests without a funding choice use owner-paid
  semantics and the approved TT133 owner-current account; explicit company-bank requests retain
  their selected financial account. A regression test covers both branches.
- Duplicate purchase invoices are rejected even when invoice number or external ID changes, and
  duplicate purchase-vs-expense fingerprints are rejected while cancelled/reversed originals are
  excluded.
