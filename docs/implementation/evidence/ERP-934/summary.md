# ERP-934 summary

Expense list/detail presentation now uses one adapter that accepts the live snake_case payload and
camelCase compatibility payload. Date, payee, category, account, description and amount no longer
depend on a stale field spelling.

No API/domain data or migration was changed.
