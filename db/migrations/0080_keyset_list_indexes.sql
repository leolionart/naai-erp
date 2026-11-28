-- Keyset pagination (BR-READ-002): lists are ordered by (date, id) inside one organization, so each
-- ordering gets a matching btree. `if not exists` keeps the migration safe to re-run.
create index if not exists journal_entries_org_date_idx
  on journal_entries (organization_id, journal_date desc, id);
--> statement-breakpoint
create index if not exists expenses_org_date_idx
  on expenses (organization_id, expense_date desc, id);
--> statement-breakpoint
create index if not exists commercial_documents_org_date_idx
  on commercial_documents (organization_id, document_date desc, id);
--> statement-breakpoint
create index if not exists bank_transactions_org_booking_idx
  on bank_transactions (organization_id, booking_date desc, id);
--> statement-breakpoint
create index if not exists bank_statement_imports_org_created_idx
  on bank_statement_imports (organization_id, created_at desc, id);
--> statement-breakpoint
create index if not exists customer_receipts_org_date_idx
  on customer_receipts (organization_id, receipt_date desc, id);
--> statement-breakpoint
create index if not exists payment_reconciliations_org_created_idx
  on payment_reconciliations (organization_id, created_at desc, id);
--> statement-breakpoint
create index if not exists evidence_records_org_updated_idx
  on evidence_records (organization_id, updated_at desc, id);
