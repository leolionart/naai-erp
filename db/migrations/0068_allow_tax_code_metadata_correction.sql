-- Allow the audited VAT tax-code correction endpoint to update tax_code on
-- final commercial-document lines without changing posted amounts or review
-- eligibility fields.
CREATE OR REPLACE FUNCTION prevent_final_commercial_document_child_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_state commercial_document_state;
BEGIN
  SELECT state INTO parent_state FROM commercial_documents
  WHERE organization_id=COALESCE(OLD.organization_id,NEW.organization_id)
    AND id=COALESCE(OLD.document_id,NEW.document_id);
  IF parent_state IN ('issued','posted','partially_paid','paid','cancelled') THEN
    IF parent_state <> 'cancelled' AND TG_OP='UPDATE'
      AND TG_TABLE_NAME='commercial_document_lines'
      AND current_setting('app.commercial_document_metadata_correction',true)='on'
      AND (to_jsonb(NEW)-ARRAY['category_code','dimensions','description'])=(to_jsonb(OLD)-ARRAY['category_code','dimensions','description']) THEN
      RETURN NEW;
    END IF;
    IF parent_state <> 'cancelled' AND TG_OP='UPDATE'
      AND TG_TABLE_NAME IN ('commercial_document_lines','commercial_document_allocations')
      AND current_setting('app.commercial_document_metadata_correction',true)='on'
      AND (to_jsonb(NEW)-ARRAY['dimensions','description'])=(to_jsonb(OLD)-ARRAY['dimensions','description']) THEN
      RETURN NEW;
    END IF;
    IF parent_state <> 'cancelled' AND TG_OP='UPDATE'
      AND TG_TABLE_NAME='commercial_document_lines'
      AND current_setting('app.tax_finalization',true)='on'
      AND (to_jsonb(NEW)-ARRAY['tax_code','management_state','cit_state','vat_state','cit_eligible_minor','vat_eligible_minor','reviewed_by','reviewed_at','review_reason','review_reference'])=(to_jsonb(OLD)-ARRAY['tax_code','management_state','cit_state','vat_state','cit_eligible_minor','vat_eligible_minor','reviewed_by','reviewed_at','review_reason','review_reference']) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'FINAL_DOCUMENT_IMMUTABLE' USING ERRCODE='55000';
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
