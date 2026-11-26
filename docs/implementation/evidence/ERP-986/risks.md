# ERP-986 Risks and Follow-Ups

- **Migration `0074_cit_revenue_tiers.sql`**: additive expand-only schema change (`create table if not exists` + idempotent seed for `statutory_cit_rate_tiers`). Run the standard migrate-once job before rolling out API containers.
- **Unimported prior-year books**: when an organization starts using NAAI ERP mid-stream and has not imported prior-year ledger entries, `basis = no_prior_year_revenue` marks `GET /reports/tax/estimated-cit` as `review_required` and provisionally estimates from current-year revenue until prior-year entries are imported or `priorYearRevenueOverrideMinor` is declared via `PUT /cit-policy`.
- **Legal/accountant confirmation**: tiered CIT estimates remain provisional management figures; final annual CIT settlement (including loss carryforward and related-party group checks under Law 67/2025/QH15) requires accountant review at year-end close.
