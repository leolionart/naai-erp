-- Optionally notify when a revenue/expense record is created as a draft (e.g. through the API or
-- an n8n ingestion), not only when its journal is posted.
ALTER TABLE "telegram_settings" ADD COLUMN "notify_drafts" boolean DEFAULT true NOT NULL;
