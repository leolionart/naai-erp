CREATE OR REPLACE FUNCTION prevent_final_expense_child_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_state expense_state;
BEGIN
  SELECT state INTO parent_state FROM expenses
  WHERE organization_id=COALESCE(OLD.organization_id,NEW.organization_id)
    AND id=COALESCE(OLD.expense_id,NEW.expense_id);
  IF parent_state = 'posted' THEN
    IF TG_OP='UPDATE' AND TG_TABLE_NAME='expense_lines'
      AND (to_jsonb(NEW)-'dimensions')=(to_jsonb(OLD)-'dimensions')
      AND (COALESCE(NEW.dimensions,'{}'::jsonb)-'category')=(COALESCE(OLD.dimensions,'{}'::jsonb)-'category') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'FINAL_EXPENSE_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
