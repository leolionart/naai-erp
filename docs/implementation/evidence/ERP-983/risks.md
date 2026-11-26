# ERP-983 Risks and Follow-ups

## Residual Risks

- **Migration coordination across parallel tasks (`0074`–`0076`)**: Migration `0077_owner_funding_and_repayment.sql` uses isolated table/column additions (`IF NOT EXISTS` / constraint checks) and reserved slot `0077`. When parallel P17 branches merge, `db/migrations/meta/_journal.json` `idx` values should remain sequential in ascending `tag`/`when` order.
- **Historical un-evidenced repayment journals**: Raw manual journals debiting `3388` and crediting `112` that were created outside `owner_funding_movements` or `owner_cash_withdrawals` intentionally remain in `reviewItems` (`unsupported_company_repayment`) until recorded or reviewed with canonical evidence, preserving `BR-BNK-004`.

## Follow-ups

- ERP-987 (month-end close & year-end owner settlement) can read `owner_funding_movements` alongside `3388` and `1388` for year-end owner reconciliation options.
