ALTER TABLE "commercial_document_lines" ADD COLUMN "original_line_number" integer;--> statement-breakpoint
ALTER TABLE "commercial_document_lines" ADD CONSTRAINT "commercial_document_lines_original_number" CHECK ("commercial_document_lines"."original_line_number" is null or "commercial_document_lines"."original_line_number" > 0);
--> statement-breakpoint
CREATE FUNCTION prevent_final_commercial_document_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state IN ('issued','posted','partially_paid','paid') AND (
    NEW.type IS DISTINCT FROM OLD.type OR NEW.document_number IS DISTINCT FROM OLD.document_number OR
    NEW.series IS DISTINCT FROM OLD.series OR NEW.fiscal_year IS DISTINCT FROM OLD.fiscal_year OR
    NEW.party_id IS DISTINCT FROM OLD.party_id OR NEW.document_date IS DISTINCT FROM OLD.document_date OR
    NEW.due_date IS DISTINCT FROM OLD.due_date OR NEW.currency IS DISTINCT FROM OLD.currency OR
    NEW.net_minor IS DISTINCT FROM OLD.net_minor OR NEW.tax_minor IS DISTINCT FROM OLD.tax_minor OR
    NEW.gross_minor IS DISTINCT FROM OLD.gross_minor OR NEW.control_account_code IS DISTINCT FROM OLD.control_account_code OR
    NEW.original_document_id IS DISTINCT FROM OLD.original_document_id
  ) THEN
    RAISE EXCEPTION 'FINAL_DOCUMENT_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER commercial_documents_final_immutable
BEFORE UPDATE ON commercial_documents
FOR EACH ROW EXECUTE FUNCTION prevent_final_commercial_document_mutation();
--> statement-breakpoint
CREATE FUNCTION prevent_final_commercial_document_child_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_state commercial_document_state;
BEGIN
  SELECT state INTO parent_state FROM commercial_documents
  WHERE organization_id=COALESCE(OLD.organization_id,NEW.organization_id)
    AND id=COALESCE(OLD.document_id,NEW.document_id);
  IF parent_state IN ('issued','posted','partially_paid','paid') THEN
    RAISE EXCEPTION 'FINAL_DOCUMENT_IMMUTABLE';
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
--> statement-breakpoint
CREATE TRIGGER commercial_document_lines_final_immutable
BEFORE UPDATE OR DELETE ON commercial_document_lines
FOR EACH ROW EXECUTE FUNCTION prevent_final_commercial_document_child_mutation();
--> statement-breakpoint
CREATE TRIGGER commercial_document_allocations_final_immutable
BEFORE UPDATE OR DELETE ON commercial_document_allocations
FOR EACH ROW EXECUTE FUNCTION prevent_final_commercial_document_child_mutation();
