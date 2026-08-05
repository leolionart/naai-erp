# ERP-430 acceptance evidence

## BR-AR-002 — Receivable aging and collection status

Pass. Domain and `GF-AGING-001` prove due today is current and overdue boundaries are 1–30, 31–60, 61–90 and over 90 days. Partial settlement changes outstanding but not the original source, while customer credits remain separate from invoice buckets.

## BR-AP-002 — Payable aging, supplier credits and advances

Pass. AP report rows distinguish payable credit balances, supplier debit/credit adjustments and advances. Advances remain separate from overdue supplier invoice buckets and are shown independently in queue/detail totals.

## Ledger tie and historical cutoff

Implemented. Only posted allocation effects dated on or before `asOf` reduce outstanding. Later reversal journals restore the balance from their own journal date. Matched reservations are ignored. Reports expose per-control-account variance and explicit exceptions instead of claiming a tie when variance is non-zero.

## UI and headless interaction

Pass. Separate `/receivables` and `/payables` queues, dedicated customer/supplier details, URL-backed filter Sheets and source/journal/reconciliation/evidence drill-down pass desktop/mobile Playwright. No AI-specific interface is displayed; machine clients use complete OpenAPI/capability/CLI contracts.
