-- Store business categories on the owning line only.
-- Category corrections remain audited metadata changes, not financial mutations.
ALTER TABLE commercial_document_lines ADD COLUMN category_code text;
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
      AND (to_jsonb(NEW)-ARRAY['management_state','cit_state','cit_eligible_minor','vat_eligible_minor','reviewed_by','reviewed_at','review_reason','review_reference'])=(to_jsonb(OLD)-ARRAY['management_state','cit_state','cit_eligible_minor','vat_eligible_minor','reviewed_by','reviewed_at','review_reason','review_reference']) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'FINAL_DOCUMENT_IMMUTABLE' USING ERRCODE='55000';
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;

CREATE OR REPLACE FUNCTION prevent_final_expense_child_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_state expense_state;
BEGIN
  SELECT state INTO parent_state FROM expenses
  WHERE organization_id=COALESCE(OLD.organization_id,NEW.organization_id)
    AND id=COALESCE(OLD.expense_id,NEW.expense_id);
  IF parent_state='posted' AND TG_OP='UPDATE' AND TG_TABLE_NAME='expense_lines'
    AND current_setting('app.expense_metadata_correction',true)='on'
    AND (to_jsonb(NEW)-ARRAY['expense_category_code','funding_treatment','description','dimensions'])=(to_jsonb(OLD)-ARRAY['expense_category_code','funding_treatment','description','dimensions']) THEN
    RETURN NEW;
  END IF;
  IF parent_state='posted' AND TG_OP='UPDATE' AND TG_TABLE_NAME='expense_lines'
    AND current_setting('app.expense_metadata_correction',true)='on'
    AND (to_jsonb(NEW)-ARRAY['expense_category_code','description','dimensions'])=(to_jsonb(OLD)-ARRAY['expense_category_code','description','dimensions']) THEN
    RETURN NEW;
  END IF;
  IF parent_state IN ('posted','reversed') AND TG_OP='UPDATE' AND TG_TABLE_NAME='expense_lines'
    AND (to_jsonb(NEW)-'dimensions')=(to_jsonb(OLD)-'dimensions')
    AND (COALESCE(NEW.dimensions,'{}'::jsonb)-'category')=(COALESCE(OLD.dimensions,'{}'::jsonb)-'category') THEN
    RETURN NEW;
  END IF;
  IF parent_state IN ('posted','reversed') AND TG_OP='UPDATE' AND TG_TABLE_NAME='expense_lines'
    AND current_setting('app.tax_finalization',true)='on'
    AND (to_jsonb(NEW)-ARRAY['management_state','cit_state','vat_state','cit_eligible_minor','vat_eligible_minor','reviewed_by','reviewed_at','review_reason','review_reference'])=(to_jsonb(OLD)-ARRAY['management_state','cit_state','vat_state','cit_eligible_minor','vat_eligible_minor','reviewed_by','reviewed_at','review_reason','review_reference']) THEN
    RETURN NEW;
  END IF;
  IF parent_state IN ('posted','reversed') THEN RAISE EXCEPTION 'FINAL_EXPENSE_IMMUTABLE' USING ERRCODE='55000'; END IF;
  RETURN COALESCE(NEW,OLD);
END $$;

SELECT set_config('app.commercial_document_metadata_correction','on',true);
SELECT set_config('app.expense_metadata_correction','on',true);

WITH candidates AS (
  SELECT l.organization_id,l.document_id,l.line_number,
         array_agg(DISTINCT candidate.category) FILTER (WHERE candidate.category IS NOT NULL) categories
    FROM commercial_document_lines l
    LEFT JOIN LATERAL (
      SELECT NULLIF(l.dimensions->>'category','') category
      UNION ALL
      SELECT NULLIF(a.dimensions->>'category','')
        FROM commercial_document_allocations a
       WHERE a.organization_id=l.organization_id AND a.document_id=l.document_id AND a.line_number=l.line_number
    ) candidate ON true
   GROUP BY l.organization_id,l.document_id,l.line_number
)
UPDATE commercial_document_lines l
SET category_code=c.categories[1]
FROM candidates c
WHERE c.organization_id=l.organization_id AND c.document_id=l.document_id AND c.line_number=l.line_number
  AND l.category_code IS NULL AND cardinality(c.categories)=1;

UPDATE commercial_document_lines
SET dimensions=COALESCE(dimensions,'{}'::jsonb)-'category'
WHERE category_code IS NOT NULL AND dimensions ? 'category';

UPDATE commercial_document_allocations a
SET dimensions=COALESCE(a.dimensions,'{}'::jsonb)-'category'
WHERE a.dimensions ? 'category'
  AND EXISTS (SELECT 1 FROM commercial_document_lines l
    WHERE l.organization_id=a.organization_id AND l.document_id=a.document_id
      AND l.line_number=a.line_number AND l.category_code IS NOT NULL);

UPDATE expense_lines l
SET expense_category_code=NULLIF(l.dimensions->>'category',''),
    funding_treatment=c.funding_treatment
FROM expense_categories c
WHERE l.organization_id=c.organization_id AND c.code=NULLIF(l.dimensions->>'category','')
  AND l.expense_category_code IS NULL;

UPDATE expense_lines
SET dimensions=COALESCE(dimensions,'{}'::jsonb)-'category'
WHERE expense_category_code IS NOT NULL AND dimensions ? 'category';
ALTER TABLE commercial_document_lines
  ADD CONSTRAINT commercial_document_lines_category_not_blank
  CHECK (category_code IS NULL OR btrim(category_code) <> '');
