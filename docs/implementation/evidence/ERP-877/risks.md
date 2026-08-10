# ERP-877 risks

- PostgreSQL integration tests are present but were not executed locally because no `DATABASE_URL` or PostgreSQL test container was available.
- The production deployment must run migration `0046_expense_quick_edit_metadata.sql` before the new endpoint can update posted records.
- Existing chart-size console warnings on the expense page are unrelated to this modal workflow.
