# ERP-932 summary

Unified revenue and recognition presentation around customer, project, activity date, amount with
currency, state and business description. Recognition API responses now enrich project and customer
identity; commercial documents continue to use their direct party as the authoritative customer.

Legacy presentation-only recognition names remain documented for compatibility but are not rendered.
No domain field, production data or database schema was removed. Adjacent aging, subscriptions,
dashboard and project-profitability views were aligned where the same stale-field pattern was found.
