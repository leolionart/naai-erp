# ERP-430 acceptance evidence

## BR-AR-002 — Receivable aging and collection status

Pending executable proof. Due today is current; overdue boundaries are 1–30, 31–60, 61–90 and over 90 days. Partial settlement changes outstanding but not the original source, while customer credits remain separate from invoice buckets.

## BR-AP-002 — Payable aging, supplier credits and advances

Pending executable proof. Payable debit/credit adjustments and supplier advances remain separate balance kinds and cannot hide overdue supplier invoices.

## Ledger tie and historical cutoff

Pending PostgreSQL proof. Only posted allocation effects dated on or before `asOf` reduce outstanding. Later reversal journals restore the balance from their own journal date. Reports expose per-control-account variance and must not claim a tie when variance is non-zero.

## UI and headless interaction

Pending rendered proof for separate `/receivables` and `/payables` queues, dedicated party details, URL-backed filter Sheets and source/journal/reconciliation/evidence drill-down. No AI-specific interface is displayed; machine clients use complete OpenAPI/capability/CLI contracts.
