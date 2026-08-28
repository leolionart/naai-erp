-- Preserve the canonical relationship between a reversed expense and the
-- replacement created by its correction workflow. Originals remain immutable;
-- this link lets lists/exports explain why the original is hidden.
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS original_expense_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expenses_original_expense_fk'
  ) THEN
    ALTER TABLE expenses
      ADD CONSTRAINT expenses_original_expense_fk
      FOREIGN KEY (organization_id, original_expense_id)
      REFERENCES expenses (organization_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS expenses_original_expense_idx
  ON expenses (organization_id, original_expense_id)
  WHERE original_expense_id IS NOT NULL;

-- Backfill correction links already recorded by the reverse-replace audit event.
-- This is idempotent and leaves unrelated/manual expenses untouched.
UPDATE expenses replacement
   SET original_expense_id = event.resource_key
  FROM resource_audit_events event
 WHERE event.organization_id = replacement.organization_id
   AND event.resource_type = 'expense'
   AND event.action = 'reverse_replace'
   AND replacement.id = event.after_state->>'replacementId'
   AND replacement.original_expense_id IS NULL;
