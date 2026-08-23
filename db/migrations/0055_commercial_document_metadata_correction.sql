-- Allow audited management metadata corrections on final commercial documents.
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
    (OLD.state <> 'cancelled' AND NEW.state NOT IN (OLD.state,'cancelled','partially_paid','paid'))
  ) THEN RAISE EXCEPTION 'FINAL_DOCUMENT_IMMUTABLE' USING ERRCODE='55000'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_final_commercial_document_child_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_state commercial_document_state;
BEGIN
  SELECT state INTO parent_state FROM commercial_documents
  WHERE organization_id=COALESCE(OLD.organization_id,NEW.organization_id)
    AND id=COALESCE(OLD.document_id,NEW.document_id);
  IF parent_state IN ('issued','posted','partially_paid','paid','cancelled') THEN
    IF parent_state <> 'cancelled' AND TG_OP='UPDATE' AND TG_TABLE_NAME='commercial_document_lines'
      AND current_setting('app.tax_finalization',true)='on'
      AND (to_jsonb(NEW)-ARRAY['management_state','cit_state','vat_state','cit_eligible_minor','vat_eligible_minor','reviewed_by','reviewed_at','review_reason','review_reference'])
        =(to_jsonb(OLD)-ARRAY['management_state','cit_state','vat_state','cit_eligible_minor','vat_eligible_minor','reviewed_by','reviewed_at','review_reason','review_reference']) THEN
      RETURN NEW;
    END IF;
    IF parent_state <> 'cancelled' AND TG_OP='UPDATE' AND TG_TABLE_NAME IN ('commercial_document_lines','commercial_document_allocations')
      AND current_setting('app.commercial_document_metadata_correction',true)='on'
      AND (to_jsonb(NEW)-ARRAY['dimensions','description'])=(to_jsonb(OLD)-ARRAY['dimensions','description'])
      AND (COALESCE(NEW.dimensions,'{}'::jsonb)-'projectId'-'category')=(COALESCE(OLD.dimensions,'{}'::jsonb)-'projectId'-'category') THEN
      RETURN NEW;
    END IF;
    IF parent_state <> 'cancelled' AND TG_OP='UPDATE' AND TG_TABLE_NAME='commercial_document_lines'
      AND (to_jsonb(NEW)-'dimensions')=(to_jsonb(OLD)-'dimensions')
      AND (COALESCE(NEW.dimensions,'{}'::jsonb)-'category')=(COALESCE(OLD.dimensions,'{}'::jsonb)-'category') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'FINAL_DOCUMENT_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
