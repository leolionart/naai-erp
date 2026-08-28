# Acceptance

- Cancelled correction originals are absent from the default commercial-document listing: covered
  by the relationship-backfill integration flow.
- Reversed expense originals are absent from the default expense listing, while
  `?state=reversed` still returns history: covered by the expense integration regression.
- Purchase/expense list exports and VAT reconciliation omit cancelled/reversed originals when no
  explicit lifecycle state is requested.
- Detail endpoints remain unchanged and continue to return the original for audit drill-down.
