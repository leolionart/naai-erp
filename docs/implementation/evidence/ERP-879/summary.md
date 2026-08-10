# ERP-879 summary

Registered the already-reviewed `0046_expense_quick_edit_metadata` SQL file in the Drizzle migration
journal. Production had the new API but silently stopped at migration 0045, so posted expense payee
updates continued to hit `FINAL_EXPENSE_IMMUTABLE`.
