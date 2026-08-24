CREATE OR REPLACE FUNCTION prevent_posted_journal_line_mutation() RETURNS trigger AS $$
DECLARE parent_state journal_state;
BEGIN
  SELECT state INTO parent_state FROM journal_entries
  WHERE organization_id=COALESCE(OLD.organization_id,NEW.organization_id)
    AND id=COALESCE(OLD.journal_id,NEW.journal_id);
  IF parent_state IN ('posted','reversed') THEN
    IF TG_OP='UPDATE'
      AND current_setting('app.journal_dimension_metadata_correction',true)='on'
      AND (to_jsonb(NEW)-'dimensions')=(to_jsonb(OLD)-'dimensions')
      AND (COALESCE(NEW.dimensions,'{}'::jsonb)-'projectId'-'category')
        =(COALESCE(OLD.dimensions,'{}'::jsonb)-'projectId'-'category') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'posted journal lines are immutable' USING ERRCODE='55000';
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$ LANGUAGE plpgsql;
