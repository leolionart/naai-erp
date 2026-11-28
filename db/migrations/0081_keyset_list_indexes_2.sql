-- Keyset pagination (BR-READ-002): remaining organization-scoped dated lists ordered by (date/timestamp, id).
create index if not exists internal_transfers_org_created_idx
  on internal_transfers (organization_id, created_at desc, id);
--> statement-breakpoint
create index if not exists project_freelance_payables_org_due_date_idx
  on project_freelance_payables (organization_id, due_date desc, id);
--> statement-breakpoint
create index if not exists report_snapshots_org_captured_idx
  on report_snapshots (organization_id, captured_at desc, id);
--> statement-breakpoint
create index if not exists accountant_exports_org_generated_idx
  on accountant_exports (organization_id, generated_at desc, id);
--> statement-breakpoint
create index if not exists workbook_import_review_rows_org_created_idx
  on workbook_import_review_rows (organization_id, created_at desc, id);
