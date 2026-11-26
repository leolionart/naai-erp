-- Unreconciling a bank payment (or reversing a receipt) must be able to move a final document
-- back from paid/partially_paid to issued/posted. The previous guard only allowed moving forward,
-- so cancelling a wrong bank match failed with FINAL_DOCUMENT_IMMUTABLE. Business fields and the
-- terminal `cancelled` state stay immutable; states may move between the final states only.
CREATE OR REPLACE FUNCTION prevent_final_commercial_document_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state IN ('issued','posted','partially_paid','paid')
    AND current_setting('app.commercial_document_metadata_correction',true)='on'
    AND (to_jsonb(NEW)-ARRAY['party_id','version','updated_at'])=(to_jsonb(OLD)-ARRAY['party_id','version','updated_at']) THEN
    RETURN NEW;
  END IF;
  IF OLD.state IN ('issued','posted','partially_paid','paid','cancelled') AND (
    NEW.type IS DISTINCT FROM OLD.type OR NEW.document_number IS DISTINCT FROM OLD.document_number OR
    NEW.series IS DISTINCT FROM OLD.series OR NEW.fiscal_year IS DISTINCT FROM OLD.fiscal_year OR
    NEW.party_id IS DISTINCT FROM OLD.party_id OR NEW.document_date IS DISTINCT FROM OLD.document_date OR
    NEW.due_date IS DISTINCT FROM OLD.due_date OR NEW.currency IS DISTINCT FROM OLD.currency OR
    NEW.net_minor IS DISTINCT FROM OLD.net_minor OR NEW.tax_minor IS DISTINCT FROM OLD.tax_minor OR
    NEW.gross_minor IS DISTINCT FROM OLD.gross_minor OR NEW.control_account_code IS DISTINCT FROM OLD.control_account_code OR
    NEW.original_document_id IS DISTINCT FROM OLD.original_document_id OR
    (OLD.state = 'cancelled' AND NEW.state IS DISTINCT FROM OLD.state) OR
    (OLD.state <> 'cancelled' AND NEW.state NOT IN (OLD.state,'cancelled','issued','posted','partially_paid','paid'))
  ) THEN RAISE EXCEPTION 'FINAL_DOCUMENT_IMMUTABLE' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END $$;
