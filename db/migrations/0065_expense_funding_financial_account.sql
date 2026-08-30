-- Preserve payment provenance for expenses. Nullable for historical rows where
-- the source account was not recorded; new writes may reference an org account.
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS funding_financial_account_id text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_funding_account_fk') THEN
    ALTER TABLE expenses
      ADD CONSTRAINT expenses_funding_account_fk
      FOREIGN KEY (organization_id, funding_financial_account_id)
      REFERENCES financial_accounts (organization_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS expenses_funding_account_idx
  ON expenses (organization_id, funding_financial_account_id)
  WHERE funding_financial_account_id IS NOT NULL;
