# ERP-857 acceptance evidence

- Form-78 sales and purchase schedules begin with `BRTT78` and `MVTT78`: passed.
- Exact 21-column structure, typed dates/money/rates and filter-aware subtotals: passed.
- Unsafe Excel integer values are rejected instead of rounded: passed.
- Non-invoice expenses remain in canonical/normalized exports but are not fabricated as invoices:
  passed.
- Management workbook exposes Doanh thu, Công nợ, Chi phí, Chỉ số tháng, Kế hoạch & mục tiêu,
  Hạng mục chi and Controls: passed.
- Invoiced, recognized and collected revenue remain separate measures: passed.
- Receivables use invoice gross less reconciled allocations; unavailable data is explicit: passed.
- Organization and party legal/accountant metadata is validated through API/store integration: passed.
- Worker correction/deactivation is organization-scoped, audited, versioned and retry-idempotent:
  passed.
- CLI routes worker mutations through REST with required headers: passed.
- Web UI offers separate date-filtered sales, purchase/expense and management downloads: passed.
- Seven-sheet rendered visual review found no clipped headers, broken formulas or blank default sheet:
  passed after print-layout refinement.
