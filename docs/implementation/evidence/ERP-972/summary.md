# ERP-972

- Extracted `ensureJournalReversed` in `PgCommercialDocumentStore` and `PgExpenseStore`.
- When voiding/reversing a posted/issued document or posted expense whose linked journal is already `reversed` (e.g., reversed directly via `/journals/:id/reverse`), the store reuses the existing reversal journal ID and transitions the document/expense to `cancelled`/`reversed` without creating a duplicate reversal journal.
