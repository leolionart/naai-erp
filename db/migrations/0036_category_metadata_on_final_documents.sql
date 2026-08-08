CREATE OR REPLACE FUNCTION prevent_final_commercial_document_child_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_state commercial_document_state;
BEGIN
  SELECT state INTO parent_state FROM commercial_documents
  WHERE organization_id=COALESCE(OLD.organization_id,NEW.organization_id)
    AND id=COALESCE(OLD.document_id,NEW.document_id);
  IF parent_state IN ('issued','posted','partially_paid','paid') THEN
    IF TG_OP='UPDATE' AND TG_TABLE_NAME='commercial_document_lines'
      AND (to_jsonb(NEW)-'dimensions')=(to_jsonb(OLD)-'dimensions')
      AND (COALESCE(NEW.dimensions,'{}'::jsonb)-'category')=(COALESCE(OLD.dimensions,'{}'::jsonb)-'category') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'FINAL_DOCUMENT_IMMUTABLE';
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
